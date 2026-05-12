-- Phase 2 (Plan 02-03): Fix category_reserve_balance VIEW.
--
-- Two bugs in the original VIEW (from 0013 Section E):
--
-- Bug 1: reserve_accum base-case WHERE used a correlated subquery referencing
--   the sibling CTE budget_per_month from inside the recursive CTE — Postgres
--   evaluates this as empty, so the anchor row was never selected and the
--   entire recursive result was empty.
--   Fix: materialise min_months as an explicit CTE before reserve_accum;
--        use a JOIN instead of a correlated subquery.
--
-- Bug 2: final SELECT used WHERE month_start = (SELECT MAX(...) FROM reserve_accum ra2 ...)
--   — self-referential subquery on a recursive CTE is not supported in Postgres.
--   Fix: use DISTINCT ON (budget_id, category_id) ORDER BY month_start DESC,
--        which selects the latest month row per category without self-reference.
--
-- Additional: budget_id = tenant_id (v1.1 design — budget IS the tenant).
--   expense_ledger.budget_id may be NULL for rows pre-dating migration 0013 A9;
--   COALESCE(e.budget_id, e.tenant_id) handles both old and new rows.
--
-- Idempotent: CREATE OR REPLACE VIEW.

--> statement-breakpoint

-- DROP first: CREATE OR REPLACE VIEW silently keeps old parse tree when the
-- final SELECT shape changes (e.g. adding DISTINCT ON + ORDER BY), which would
-- leave the broken version active. DROP + CREATE guarantees the new DDL is used.
DROP VIEW IF EXISTS budgeting.category_reserve_balance;

--> statement-breakpoint

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
  -- Bug 1 fix: pre-compute first month per (budget_id, category_id).
  -- reserve_accum's base-case uses a JOIN here instead of a correlated
  -- subquery inside the recursive CTE.
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
)
-- Bug 2 fix: DISTINCT ON avoids a self-referential subquery on the recursive CTE.
-- Picks the latest month_start row per (budget_id, category_id).
SELECT DISTINCT ON (budget_id, category_id)
  budget_id,
  category_id,
  tenant_id,
  reserve_cents AS balance_cents
FROM reserve_accum
ORDER BY budget_id, category_id, month_start DESC;

--> statement-breakpoint

-- Re-grant after DROP+CREATE (grants are lost when view is dropped).
GRANT SELECT ON budgeting.category_reserve_balance TO app_role, worker_role;
