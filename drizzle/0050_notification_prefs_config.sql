-- r32: extensible per-preference config for notification types that need more
-- than an on/off flag. Currently used by BUDGET_REMINDER to store the selected
-- weekdays + the user's timezone: {"days":[1,2,3,4,5,6,7],"tz":"Europe/Warsaw"}
-- (ISO weekday 1=Mon..7=Sun). Nullable — existing on/off prefs (RESERVE_TOPUP,
-- CONFIRM_DRAFT, CUSHION_BELOW_TARGET, TASK_COMPLETED) leave it NULL.
--
-- Idempotent (IF NOT EXISTS) — the dev DB may re-run. RLS + role grants on
-- shared_kernel.notification_prefs already exist (migration 0032); adding a
-- column inherits them.

--> statement-breakpoint
ALTER TABLE shared_kernel.notification_prefs
  ADD COLUMN IF NOT EXISTS config jsonb;
