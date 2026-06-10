-- UAT-PH5-T3-55: expected reserve excludes the current (unclosed) month and
-- still surfaces categories that have only adjustments (no past-month history).
--
-- Bug 1: a brand-new category with planned=300 and no transactions showed
-- expected reserve = 300 immediately, because the view accumulated
-- (planned - spent) for the CURRENT month.
-- Bug 2 (first 0023 attempt): filtering past-month only made categories that
-- had ONLY a reserve adjustment (no past-month limit history) disappear,
-- because the row source was reserve_accum.
--
-- Spec: expected = Σ adjustments + Σ past-month leftovers - Σ past-month uses.
--   - Past-month leftovers come from reserve_accum filtered to closed months.
--   - Adjustments come from the ledger SUM regardless of month.
-- Both sources are LEFT JOINed onto categories; rows surface when EITHER side
-- has a value. New categories created this month with planned but no
-- adjustments + no past-month history return no row (caller treats as 0).
--
-- View is security_invoker=true (migration 0017), re-applied at the end.
-- Grants re-applied (lost on DROP).

--> statement-breakpoint

DROP VIEW IF EXISTS budgeting.category_reserve_balance;

--> statement-breakpoint

CREATE VIEW budgeting.category_reserve_balance AS
WITH RECURSIVE months AS (
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

  SELECT budget_id, category_id, tenant_id,
         (month_start + INTERVAL '1 month')::date
  FROM months
  WHERE month_start < date_trunc('month', CURRENT_DATE)::date
),
monthly_spent AS (
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
  SELECT budget_id, category_id, MIN(month_start) AS first_month
  FROM budget_per_month
  GROUP BY budget_id, category_id
),
reserve_accum AS (
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
-- UAT-PH5-T3-55: only past closed months contribute "leftovers".
latest_past AS (
  SELECT DISTINCT ON (budget_id, category_id)
    budget_id, category_id, tenant_id, reserve_cents
  FROM reserve_accum
  WHERE month_start < date_trunc('month', CURRENT_DATE)::date
  ORDER BY budget_id, category_id, month_start DESC
),
adjustments AS (
  SELECT category_id, SUM(delta_cents) AS adj_total
  FROM budgeting.category_reserve_adjustments
  GROUP BY category_id
)
SELECT
  c.tenant_id AS budget_id,
  c.id AS category_id,
  c.tenant_id,
  (COALESCE(lp.reserve_cents, 0) + COALESCE(adj.adj_total, 0)) AS balance_cents
FROM budgeting.categories c
LEFT JOIN latest_past lp
  ON lp.category_id = c.id AND lp.budget_id = c.tenant_id
LEFT JOIN adjustments adj
  ON adj.category_id = c.id
WHERE c.reserve_excluded = false
  AND (lp.reserve_cents IS NOT NULL OR adj.adj_total IS NOT NULL);

--> statement-breakpoint

ALTER VIEW budgeting.category_reserve_balance SET (security_invoker = true);

--> statement-breakpoint

GRANT SELECT ON budgeting.category_reserve_balance TO app_role, worker_role;
