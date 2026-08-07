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
-- Every reference SCHEMA-QUALIFIED. The original type is budgeting.wallet_type
-- (0012), and unqualified names resolve against whatever search_path the caller
-- happens to carry: the dev migrator found it, a fresh CI database did not, and
-- this file failed there with `type "wallet_type" does not exist` — taking the
-- tenant-leak, compose-smoke and e2e jobs with it. Qualifying also keeps the new
-- type in `budgeting` instead of quietly leaving it in `public`, which is where
-- the unqualified CREATE had been putting it.
CREATE TYPE budgeting.wallet_type_v2 AS ENUM (
  'SPENDINGS', 'CUSHION', 'RESERVE', 'POSSESSION', 'OTHER'
);
ALTER TABLE budgeting.wallets ALTER COLUMN wallet_type DROP DEFAULT;
ALTER TABLE budgeting.wallets
  ALTER COLUMN wallet_type TYPE budgeting.wallet_type_v2
  USING wallet_type::text::budgeting.wallet_type_v2;
ALTER TABLE budgeting.wallets
  ALTER COLUMN wallet_type SET DEFAULT 'SPENDINGS'::budgeting.wallet_type_v2;
DROP TYPE budgeting.wallet_type;
ALTER TYPE budgeting.wallet_type_v2 RENAME TO wallet_type;

-- The data move lives in 0072: these tables are FORCE RLS and the migrator
-- role does not bypass it, so the move needs FORCE lifted for its duration.
