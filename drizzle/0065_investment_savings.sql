-- 0065_investment_savings.sql
-- New investment holding type: "savings" — a manual savings pot. Starting amount
-- rides buy_price_cents, current amount rides current_price_cents, quantity=1, no
-- instrument. %change = (current-starting)/starting (existing profitLossPct). No
-- new columns, no accrual math — only the allow-lists grow. Idempotent.

-- Postgres can't ALTER a CHECK in place — drop + re-add. 'savings' added to both.
ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_holding_type_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_holding_type_chk
  CHECK (holding_type IN ('equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other','deposit','savings'));

ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_ui_type_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_ui_type_chk
  CHECK (ui_type IS NULL OR ui_type IN ('equity','etf','etb','reit','crypto','treasury_bond','collectibles','real_estate','other','precious_metals','cash','broker','deposit','savings'));
