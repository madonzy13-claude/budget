-- Phase 9.2: global instrument universe ranking + Broker holding type.
-- Hand-authored (drizzle-kit BigInt serialization bug forbids `generate`; 0038/0039 precedent).
-- Idempotent throughout (IF NOT EXISTS / DROP IF EXISTS) — the dev DB may re-run it.
--
--   instruments.rank   prominence weight used to ORDER search suggestions so the most
--                      likely instrument surfaces first within a match tier. Stocks/ETF
--                      get an exchange-tier weight; crypto gets a CoinGecko market-cap
--                      rank; manual/obscure rows stay low. Higher = more prominent.
--   ui_type 'broker'   new user-facing type: a brokerage/cash account tracked by a
--                      deposited value vs an actual value (no instrument, no quantity).
--                      Maps to the coarse holding_type 'other' (price routing N/A).

--> statement-breakpoint
ALTER TABLE budgeting.instruments
  ADD COLUMN IF NOT EXISTS rank smallint NOT NULL DEFAULT 0;

--> statement-breakpoint
-- Tie-break ordering after the trigram match-tier: rank DESC, then name. A plain
-- btree on rank can't fuse with the GIN trigram scan, but it helps the top-N sort
-- when a short query matches a large candidate set.
CREATE INDEX IF NOT EXISTS instruments_rank_idx
  ON budgeting.instruments (rank DESC)
  WHERE active = true;

--> statement-breakpoint
-- Pitfall 1 (0038/0039): Postgres cannot ALTER a CHECK in place — DROP then ADD.
-- Adds the 12th ui_type 'broker'; nothing removed.
ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_ui_type_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_ui_type_chk
  CHECK (ui_type IS NULL OR ui_type IN (
    'equity','etf','etb','reit','crypto',
    'treasury_bond','collectibles','real_estate','other',
    'precious_metals','cash','broker'
  ));
