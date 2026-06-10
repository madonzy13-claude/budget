-- Phase 05 Plan 01: Reserves & Wallets Tabs — Schema Delta
--
-- Summary of changes:
--   1. CREATE TABLE budgeting.category_reserve_adjustments  (D-PH5-R8)
--      Append-only adjustments ledger; signed delta_cents; RLS + FORCE RLS.
--   2. ENABLE + FORCE RLS + RLS POLICY on category_reserve_adjustments  (T-05-04)
--   3. Composite index (tenant_id, category_id, occurred_at DESC)  (D-PH5-R8)
--   4. ADD COLUMN categories.reserve_excluded boolean NOT NULL DEFAULT false  (D-PH5-R10)
--   5. ADD COLUMN tenancy.budgets.reserves_enabled boolean NOT NULL DEFAULT true  (D-PH5-R11)
--   6. DROP + CREATE VIEW budgeting.category_reserve_balance  (D-PH5-R9)
--      Folds in SUM(adjustments) per category; filters reserve_excluded = false.
--
-- Idempotent guards: IF NOT EXISTS on CREATE TABLE, index, ADD COLUMN.
-- statement-breakpoints between every DDL block (drizzle-kit convention).

--> statement-breakpoint

-- Block 1: CREATE TABLE category_reserve_adjustments
CREATE TABLE IF NOT EXISTS "budgeting"."category_reserve_adjustments" (
  "id"          uuid         PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid         NOT NULL,
  "category_id" uuid         NOT NULL REFERENCES "budgeting"."categories"("id"),
  "delta_cents" bigint       NOT NULL,
  "note"        text,
  "created_by"  uuid         REFERENCES "identity"."users"("id"),
  "occurred_at" timestamptz  NOT NULL DEFAULT now()
);

--> statement-breakpoint

-- Block 2: ENABLE + FORCE RLS + Policy (T-05-04; pattern from 0011 lines 47-53)
ALTER TABLE "budgeting"."category_reserve_adjustments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budgeting"."category_reserve_adjustments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "category_reserve_adjustments_tenant_isolation"
  ON "budgeting"."category_reserve_adjustments"
  AS PERMISSIVE FOR ALL TO "app_role","worker_role"
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint

-- Block 3: Composite index (D-PH5-R8)
CREATE INDEX IF NOT EXISTS "category_reserve_adjustments_tenant_cat_occurred_idx"
  ON "budgeting"."category_reserve_adjustments" (tenant_id, category_id, occurred_at DESC);

--> statement-breakpoint

-- Block 4: categories.reserve_excluded (D-PH5-R10)
ALTER TABLE "budgeting"."categories"
  ADD COLUMN IF NOT EXISTS "reserve_excluded" boolean NOT NULL DEFAULT false;

--> statement-breakpoint

-- Block 5: tenancy.budgets.reserves_enabled (D-PH5-R11)
ALTER TABLE "tenancy"."budgets"
  ADD COLUMN IF NOT EXISTS "reserves_enabled" boolean NOT NULL DEFAULT true;

--> statement-breakpoint

-- Block 6: DROP + CREATE VIEW budgeting.category_reserve_balance (D-PH5-R9)
-- DROP first: CREATE OR REPLACE VIEW keeps the old parse tree when final SELECT shape
-- changes. The existing VIEW uses security_invoker=true (set by 0017); it will be
-- re-applied via the SET command at the end of this block.
DROP VIEW IF EXISTS budgeting.category_reserve_balance;

--> statement-breakpoint

-- Re-create VIEW with Phase 5 additions:
--   * LEFT JOIN on category_reserve_adjustments (SUM of delta_cents per category)
--   * INNER JOIN on categories to read reserve_excluded flag
--   * WHERE categories.reserve_excluded = false filters Excluded rows from totals
--   * balance_cents = reserve_accum.reserve_cents + COALESCE(adj_total, 0)
--   * Public shape {budget_id, category_id, tenant_id, balance_cents} preserved.
CREATE VIEW budgeting.category_reserve_balance AS
WITH RECURSIVE months AS (
  -- Anchor: one row per (tenant_id, category_id) starting at the earliest
  -- limit effective_from or transaction month, whichever is earlier.
  SELECT
    cl.tenant_id AS budget_id,
    cl.category_id,
    cl.tenant_id,
    LEAST(
      COALESCE(date_trunc('month', MIN(cl.effective_from))::date, date_trunc('month', CURRENT_DATE)::date),
      COALESCE(date_trunc('month', MIN(e.transaction_date))::date, date_trunc('month', CURRENT_DATE)::date)
    ) AS month_start
  FROM budgeting.category_limits cl
  LEFT JOIN budgeting.expense_ledger e
    ON e.category_id = cl.category_id
   AND COALESCE(e.budget_id, e.tenant_id) = cl.tenant_id
   AND e.deleted_at IS NULL
  GROUP BY cl.tenant_id, cl.category_id

  UNION ALL

  -- Recursive: advance one month at a time up to (and including) current month.
  SELECT budget_id, category_id, tenant_id,
         (month_start + INTERVAL '1 month')::date
  FROM months
  WHERE month_start < date_trunc('month', CURRENT_DATE)::date
),
monthly_spent AS (
  -- Net spent per (budget_id, category_id, month): INCOME rows subtract (D-PH2-09).
  SELECT
    COALESCE(e.budget_id, e.tenant_id) AS budget_id,
    e.category_id,
    date_trunc('month', e.transaction_date)::date AS month_start,
    SUM(
      CASE
        WHEN e.kind = 'SPENDING' THEN  e.amount_converted_cents
        WHEN e.kind = 'INCOME'   THEN -e.amount_converted_cents
        ELSE 0
      END
    ) AS spent_cents
  FROM budgeting.expense_ledger e
  WHERE e.confirmed_at IS NOT NULL AND e.deleted_at IS NULL
  GROUP BY COALESCE(e.budget_id, e.tenant_id), e.category_id,
           date_trunc('month', e.transaction_date)
),
mode_per_month AS (
  -- SCD-2 lookup: cushion mode active AS OF each month. Defaults to NORMAL.
  SELECT DISTINCT
    m.budget_id, m.month_start,
    COALESCE(
      (SELECT bmh.mode
       FROM budgeting.budget_mode_history bmh
       WHERE bmh.budget_id = m.budget_id
         AND bmh.effective_from <= m.month_start
         AND (bmh.effective_to IS NULL OR bmh.effective_to > m.month_start)
       ORDER BY bmh.effective_from DESC LIMIT 1),
      'NORMAL'
    ) AS mode
  FROM months m
),
budget_per_month AS (
  -- Active budget per category per month: normal_amount or cushion_amount_cents
  -- based on mode-as-of that month (RSCM-02).
  SELECT
    cl.tenant_id AS budget_id,
    cl.category_id,
    cl.tenant_id,
    m.month_start,
    CASE
      WHEN mpm.mode = 'CUSHION' THEN COALESCE(cl.cushion_amount_cents, 0)
      ELSE                           COALESCE(cl.normal_amount, 0)
    END AS active_budget_cents
  FROM months m
  JOIN budgeting.category_limits cl
    ON cl.category_id   = m.category_id
   AND cl.tenant_id     = m.budget_id
   AND cl.effective_from <= m.month_start
   AND (cl.effective_to IS NULL OR cl.effective_to > m.month_start)
  LEFT JOIN mode_per_month mpm
    ON mpm.budget_id = m.budget_id AND mpm.month_start = m.month_start
),
min_months AS (
  -- Bug 1 fix (0014): pre-compute first month per (budget_id, category_id).
  SELECT budget_id, category_id, MIN(month_start) AS first_month
  FROM budget_per_month
  GROUP BY budget_id, category_id
),
reserve_accum AS (
  -- Base case: first month's reserve = GREATEST(0, active_budget - spent).
  SELECT
    bpm.budget_id,
    bpm.category_id,
    bpm.tenant_id,
    bpm.month_start,
    GREATEST(0, bpm.active_budget_cents - COALESCE(ms.spent_cents, 0)) AS reserve_cents
  FROM budget_per_month bpm
  JOIN min_months mm
    ON mm.budget_id   = bpm.budget_id
   AND mm.category_id = bpm.category_id
   AND bpm.month_start = mm.first_month
  LEFT JOIN monthly_spent ms
    ON ms.budget_id   = bpm.budget_id
   AND ms.category_id = bpm.category_id
   AND ms.month_start = bpm.month_start

  UNION ALL

  -- Recursive case: carry forward previous reserve, clamp at 0 (RSRV-02).
  SELECT
    bpm.budget_id,
    bpm.category_id,
    bpm.tenant_id,
    bpm.month_start,
    GREATEST(0,
      ra.reserve_cents + bpm.active_budget_cents - COALESCE(ms.spent_cents, 0)
    ) AS reserve_cents
  FROM reserve_accum ra
  JOIN budget_per_month bpm
    ON bpm.budget_id   = ra.budget_id
   AND bpm.category_id = ra.category_id
   AND bpm.month_start = (ra.month_start + INTERVAL '1 month')::date
  LEFT JOIN monthly_spent ms
    ON ms.budget_id   = bpm.budget_id
   AND ms.category_id = bpm.category_id
   AND ms.month_start = bpm.month_start
),
-- Phase 5 (D-PH5-R9): pre-aggregate adjustments per category.
adjustments AS (
  SELECT category_id, SUM(delta_cents) AS adj_total
  FROM budgeting.category_reserve_adjustments
  GROUP BY category_id
)
-- Bug 2 fix (0014): DISTINCT ON avoids a self-referential subquery on the recursive CTE.
-- Phase 5: JOIN categories to read reserve_excluded; LEFT JOIN adjustments for delta.
SELECT DISTINCT ON (ra.budget_id, ra.category_id)
  ra.budget_id,
  ra.category_id,
  ra.tenant_id,
  ra.reserve_cents + COALESCE(adj.adj_total, 0) AS balance_cents
FROM reserve_accum ra
INNER JOIN budgeting.categories c
  ON c.id = ra.category_id
LEFT JOIN adjustments adj
  ON adj.category_id = ra.category_id
WHERE c.reserve_excluded = false
ORDER BY ra.budget_id, ra.category_id, ra.month_start DESC;

--> statement-breakpoint

-- Re-apply security_invoker=true (lost on DROP; set by migration 0017).
ALTER VIEW budgeting.category_reserve_balance SET (security_invoker = true);

--> statement-breakpoint

-- Re-grant after DROP+CREATE (grants are lost when view is dropped).
GRANT SELECT ON budgeting.category_reserve_balance TO app_role, worker_role;
