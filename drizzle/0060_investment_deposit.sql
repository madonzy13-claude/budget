-- 0060_investment_deposit.sql
-- New investment holding type: "deposit" — a bank savings deposit that accrues
-- interest. Value is computed on read (principal + annual rate + capitalization
-- cadence + start/end), so we only persist the inputs. Idempotent throughout.

ALTER TABLE budgeting.investments
  ADD COLUMN IF NOT EXISTS deposit_rate_bps integer,        -- annual rate, basis points (525 = 5.25%)
  ADD COLUMN IF NOT EXISTS deposit_start_date date,         -- first day interest accrues
  ADD COLUMN IF NOT EXISTS deposit_end_date date,           -- optional maturity; value freezes on/after
  ADD COLUMN IF NOT EXISTS deposit_cap_frequency text;      -- daily|monthly|quarterly|semiannual|yearly

-- Extend the holding_type / ui_type allow-lists (Postgres can't ALTER a CHECK in
-- place — drop + re-add). 'deposit' is added to both.
ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_holding_type_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_holding_type_chk
  CHECK (holding_type IN ('equities','etf','bond','crypto','reit','commodity','cash_fx','real_estate','other','deposit'));

ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_ui_type_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_ui_type_chk
  CHECK (ui_type IS NULL OR ui_type IN ('equity','etf','etb','reit','crypto','treasury_bond','collectibles','real_estate','other','precious_metals','cash','broker','deposit'));

ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_deposit_cap_frequency_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_deposit_cap_frequency_chk
  CHECK (deposit_cap_frequency IS NULL OR deposit_cap_frequency IN ('daily','monthly','quarterly','semiannual','yearly'));
