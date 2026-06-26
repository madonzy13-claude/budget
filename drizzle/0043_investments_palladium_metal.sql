-- Phase 9.2: add palladium to the precious-metals enum.
-- Widen the investments.metal CHECK so 'palladium' (XPD/USD spot) is a valid
-- precious-metals holding alongside gold/silver/platinum. Idempotent: drop the
-- old constraint if present, then re-add with the extended set.

--> statement-breakpoint
ALTER TABLE budgeting.investments
  DROP CONSTRAINT IF EXISTS investments_metal_chk;
--> statement-breakpoint
ALTER TABLE budgeting.investments
  ADD CONSTRAINT investments_metal_chk
  CHECK (metal IS NULL OR metal IN ('gold','silver','platinum','palladium'));
