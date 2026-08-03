-- Two more wallet kinds, and possessions become wallets (260803).
--
-- OTHER      — an asset that belongs to nothing in particular. Counts toward net
--              worth AND the retirement pot like any wallet, but is never part
--              of available-to-spend, the cushion or the reserves.
-- POSSESSION — a house, a car. Counts toward net worth but NOT the retirement
--              pot: you cannot spend a house down month by month.
--
-- Possessions lived in budgeting.investments under holding_type 'possession'.
-- They never used anything the holdings table offers: every row had quantity 1,
-- no instrument, no group, and the editor wrote the same figure to both
-- buy_price and current_price, so the cost basis was always collapsed. They are
-- a name, an amount, an icon and an order — which is a wallet. Making them one
-- is what lets them sort and drag alongside the rest (user decision).
--
-- The type is REPLACED rather than extended: Postgres refuses to use a value
-- added to an existing enum inside the transaction that added it, and the
-- migrator runs every file in one transaction. A type created in the same
-- transaction carries no such restriction.
CREATE TYPE wallet_type_v2 AS ENUM (
  'SPENDINGS', 'CUSHION', 'RESERVE', 'POSSESSION', 'OTHER'
);
ALTER TABLE budgeting.wallets ALTER COLUMN wallet_type DROP DEFAULT;
ALTER TABLE budgeting.wallets
  ALTER COLUMN wallet_type TYPE wallet_type_v2
  USING wallet_type::text::wallet_type_v2;
ALTER TABLE budgeting.wallets
  ALTER COLUMN wallet_type SET DEFAULT 'SPENDINGS'::wallet_type_v2;
DROP TYPE wallet_type;
ALTER TYPE wallet_type_v2 RENAME TO wallet_type;

-- The data move lives in 0072: these tables are FORCE RLS and the migrator
-- role does not bypass it, so the move needs FORCE lifted for its duration.
