-- 0068_member_share_decimal.sql
-- Let the per-member all-budgets ownership share hold DECIMALS (e.g. 33.5%).
-- Was SMALLINT (integers only); widen to numeric(5,2). Existing integer values
-- cast losslessly. Idempotent-ish (ALTER TYPE is safe to re-run on numeric).
ALTER TABLE tenancy.budget_members
  ALTER COLUMN ownership_share_pct TYPE numeric(5, 2)
  USING ownership_share_pct::numeric(5, 2);
