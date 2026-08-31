-- 0084: plain tenant_id indexes on the hot tenant-scoped tables.
--
-- WHY: RLS appends `tenant_id = ANY(app.tenant_ids)` to every query these
-- tables serve, but none of them had an index that predicate could use. The
-- partial ones that exist are gated on other columns — categories has
-- (tenant_id) WHERE archived_at IS NULL and WHERE is_investment — so any query
-- not carrying that exact predicate falls back to a sequential scan.
--
-- Measured on the dev database before this migration (pg_stat_user_tables):
--
--   investments           3,667,578 seq scans   629M tuples read   47 idx scans
--   budget_mode_history   2,170,917 seq scans   290M tuples read   10 idx scans
--   category_limits       2,046,876 seq scans  4.69B tuples read
--   categories              905,437 seq scans  1.88B tuples read
--
-- Only tables with that measured volume are indexed here. incomes and
-- scheduled_payments were in an earlier draft of this migration on the theory
-- that their partial indexes left a gap; neither showed the scan counts to
-- justify one, so they are not indexed. scheduled_payments additionally has a
-- test asserting its complete index set, and an index nothing measured wanted
-- is not worth weakening that assertion for.
--
-- HONEST SCOPE — these indexes are NOT the fix for the slow endpoint that
-- prompted them. /budgets/aggregate was at p50 1699ms; with these indexes
-- applied it measured 1569ms, about 8%. The cause was an N+1: the reserve
-- replay called effectiveForMonth once per month, so a single aggregate
-- request issued 212 limit lookups and 2,665 GUC statements. Batching that
-- into effectiveForMonths took the same endpoint 1952ms -> 816ms on the same
-- account. These indexes are still right — a sequential scan costs in
-- proportion to the table, and they turn the batched lookup into a bitmap
-- index scan — but they are a supporting change, not the headline.
--
-- Composite where the hot query filters on more than the tenant: the
-- category_limits lookup is
--   WHERE tenant_id = $1 AND effective_from <= $2
--     AND (effective_to IS NULL OR effective_to > $3)
-- so effective_from rides along as the second column.
--
-- Plain btree, not CONCURRENTLY: migrations run inside a transaction, and
-- these tables are small enough that the brief lock is not worth splitting the
-- migration to avoid.

CREATE INDEX IF NOT EXISTS category_limits_tenant_effective_idx
  ON budgeting.category_limits (tenant_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS investments_tenant_idx
  ON budgeting.investments (tenant_id);

CREATE INDEX IF NOT EXISTS budget_mode_history_tenant_idx
  ON budgeting.budget_mode_history (tenant_id, effective_from DESC);

-- Unconditional companion to the existing PARTIAL indexes: those only serve a
-- query that also carries their predicate.
CREATE INDEX IF NOT EXISTS categories_tenant_all_idx
  ON budgeting.categories (tenant_id);
