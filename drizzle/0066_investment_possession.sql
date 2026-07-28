-- 0066_investment_possession.sql
-- New holding type: "possession" — a physical possession (house/car/jewelry/…).
-- A single current amount rides current_price_cents, quantity=1, no instrument.
-- Adds an optional per-item `icon` column (curated lucide key, e.g. 'car') used
-- ONLY by possessions. Possessions count toward capitalization (net worth) but
-- are excluded from the retirement runway pot — that split lives in the app
-- layer, not here. Idempotent.

-- Per-item icon key (nullable; NULL for every non-possession holding).
ALTER TABLE budgeting.investments ADD COLUMN IF NOT EXISTS icon text;

-- Postgres can't ALTER a CHECK in place — drop + re-add. 'possession' added to both.
ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_holding_type_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_holding_type_chk
  CHECK (holding_type IN ('equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other','deposit','savings','possession'));

ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_ui_type_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_ui_type_chk
  CHECK (ui_type IS NULL OR ui_type IN ('equity','etf','etb','reit','crypto','treasury_bond','collectibles','real_estate','other','precious_metals','cash','broker','deposit','savings','possession'));
