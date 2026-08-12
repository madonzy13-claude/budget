-- 0082 — privacy mode belongs to the person, not the budget (260810, user request).
--
-- Hiding amounts behind a redaction bar answers "who is standing behind me",
-- and that is one member's circumstance, not a property of the household's
-- money. Until now it was a single boolean on tenancy.budgets, so one member
-- switching it off uncovered every other member's screen too.
--
-- The setting moves to the MEMBERSHIP row, beside the other per-member state
-- (ui_prefs, display_name, ownership_share_pct).
--
-- Two ALTERs rather than one, deliberately: the column is ADDed with DEFAULT
-- true so every EXISTING membership keeps privacy on — which is what all 5440
-- budgets carry today (tenancy.budgets.amount_privacy_enabled is true for
-- every row, checked before writing this) — and the default is only then
-- flipped to false, which is what NEW members get from here on. A backfill
-- UPDATE joined to tenancy.budgets would have said the same thing, but both
-- tables are FORCE ROW LEVEL SECURITY and a joined write under FORCE silently
-- touched nothing once before (0072, 82 rows lost). This form needs no join,
-- no policy lift, and no row to be visible.
ALTER TABLE tenancy.budget_members
  ADD COLUMN IF NOT EXISTS amount_privacy_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE tenancy.budget_members
  ALTER COLUMN amount_privacy_enabled SET DEFAULT false;

-- tenancy.budgets.amount_privacy_enabled is left in place but is no longer
-- read or written by the app: dropping it would take the only record of what
-- each budget's members were migrated FROM.
COMMENT ON COLUMN tenancy.budgets.amount_privacy_enabled IS
  'DEPRECATED (0082): superseded by tenancy.budget_members.amount_privacy_enabled. Kept as the migration source of record; not read by the application.';
