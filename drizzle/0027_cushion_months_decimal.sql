-- 0027_cushion_months_decimal.sql
--
-- UAT round 7: allow fractional cushion target months (e.g. 4.5).
-- Promote integer column to numeric(4,1) so the user can pick half-month
-- (or finer) runway granularities without losing precision.
--
-- Backward-compat: existing integer values round-trip through numeric(4,1)
-- unchanged. The CHECK constraint stays the same (1..60); fractional values
-- between those bounds are now valid.
--
-- Math impact: get-cushion-summary.ts must no longer call
-- BigInt(budget.cushion_target_months) directly — it parses to Number and
-- promotes via Math.round(months * 10) to keep BigInt math precision.

ALTER TABLE tenancy.budgets
  ALTER COLUMN cushion_target_months TYPE numeric(4,1)
    USING cushion_target_months::numeric(4,1);
