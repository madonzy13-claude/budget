-- Phase 6 onboarding wizard rewrite: surface a pure "Cushion" feature flag
-- alongside `reserves_enabled` so the wizard can ask the user a single
-- yes/no question per feature without dragging in the SCD-2 cushion-mode
-- tracker (`cushion_mode_enabled` + budget_mode_history).
--
-- Why a NEW column rather than reusing cushion_mode_enabled:
--   * cushion_mode_enabled toggles whether the CURRENT MONTH is recorded
--     as CUSHION vs NORMAL — it is the operative flag for budget mode and
--     is paired with an append-only history row each time it flips.
--   * cushion_enabled gates whether the cushion feature is available at
--     all for the budget. A user can keep the feature enabled but switch
--     between cushion/normal months from Settings.
--
-- Default TRUE preserves existing UX: every pre-feature budget keeps the
-- cushion column visible until the owner opts out from Settings → Features.

--> statement-breakpoint

ALTER TABLE "tenancy"."budgets"
  ADD COLUMN IF NOT EXISTS "cushion_enabled" boolean NOT NULL DEFAULT true;
