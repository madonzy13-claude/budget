-- r36 fix: repurpose the flag added in 0055. It was mistakenly built as
-- "hide the Overview page"; it should control AMOUNT PRIVACY instead:
--   enabled (default true)  → Overview amounts are HIDDEN by default (redaction
--                             bars) and the eye toggle is shown to reveal them.
--   disabled (false)        → amounts are always visible; no eye toggle.
--
-- Rename the column so the name matches the behavior. Idempotent-ish: guarded so
-- re-running is a no-op if 0055's column is already renamed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'tenancy' AND table_name = 'budgets'
      AND column_name = 'overview_enabled'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'tenancy' AND table_name = 'budgets'
      AND column_name = 'amount_privacy_enabled'
  ) THEN
    ALTER TABLE tenancy.budgets
      RENAME COLUMN overview_enabled TO amount_privacy_enabled;
  END IF;
END $$;
