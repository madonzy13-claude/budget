-- 0094: investment_history.asset_amount_cents (Phase 13.1, round-6 gap 2).
--
-- The amount in the asset's own currency fixed at the deal — a sale's
-- proceeds, a buy's or leg's cost. The ledger shows it under a
-- foreign-currency entry instead of re-converting at a later rate.
-- DDL only: existing rows stay NULL here (backfill = 0095, user-approved).

--> statement-breakpoint
ALTER TABLE budgeting.investment_history ADD COLUMN IF NOT EXISTS asset_amount_cents BIGINT;

--> statement-breakpoint
COMMENT ON COLUMN budgeting.investment_history.asset_amount_cents IS
  'amount in the asset''s own currency fixed at the deal, unsigned like amount_cents; NULL = not recorded (13.1 R6-2)';
