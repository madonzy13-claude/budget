-- Phase 9.2: user-entered ticker for manual holdings.
-- A tracked-type holding can be added by hand ("enter manually") when its ticker
-- isn't in the catalog — it has no instrument_id, so no joined symbol. Store the
-- ticker the user typed here; reads COALESCE(instrument.symbol, manual_ticker) so
-- the list renders a ticker for manual entries too (equity/etf/crypto/reit).
-- Idempotent.

--> statement-breakpoint
ALTER TABLE budgeting.investments
  ADD COLUMN IF NOT EXISTS manual_ticker text;
