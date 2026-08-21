-- 0083 — "No limit": a category that is deliberately unbounded (260819, user request).
--
-- Until now there was no way to say "this category has no limit". The nearest
-- thing was leaving the limit unset, which is a different statement entirely and
-- the app reads it two contradictory ways: every consumer coerces a missing row
-- to 0 (so the whole spend reports as OVERSPENT), while the Planned chart's inner
-- LATERAL join drops the category from the chart altogether. Neither is "no limit".
--
-- The flag lives HERE, on the effective-dated limit row, and not on
-- budgeting.categories. Limits are SCD-2 and the reserve engine judges each month
-- against the value in force THAT month, so a month that ran with a real limit
-- must keep its overspend forever. A flag on the category would be a single
-- present-tense fact and would silently rewrite history every time it was toggled
-- — the same split that already makes categories.cushion_mode disagree with its
-- own amounts for past months.
--
-- Rows with no_limit = true carry normal_amount = 0 and cushion_amount = 0. Those
-- columns stay NOT NULL: the flag, not a NULL, is what says "unbounded", so there
-- is no third state for a money column to be read in and every consumer branches
-- on the boolean it can see. needs_amount/wants_amount are left NULL — such a
-- category's planned figure comes from its scheduled payments, split by their own
-- Need/Want flag (0084), not from a typed number.
ALTER TABLE budgeting.category_limits
  ADD COLUMN IF NOT EXISTS no_limit boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN budgeting.category_limits.no_limit IS
  'Unbounded for the months this SCD-2 segment covers: cannot be overspent, accrues nothing to the reserve. normal_amount/cushion_amount are 0 and unused while true.';
