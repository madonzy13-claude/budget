-- Phase 9.1: type-first investments redesign.
-- Hand-authored (drizzle-kit BigInt serialization bug forbids `generate`; 0038 precedent).
-- Adds the UI-type discriminator + precious-metals attributes to budgeting.investments.
-- Idempotent (IF NOT EXISTS / DROP IF EXISTS) — the dev DB may re-run it.
--
--   ui_type           the user-facing type the add/edit form was filled with. The
--                     coarse holding_type stays for price routing/asset_class; ui_type
--                     disambiguates the cases holding_type can't (exchange-traded vs
--                     retail-treasury bonds → both 'bond'; collectibles → 'other').
--   metal             precious-metals only: gold | silver | platinum.
--   metal_kind        precious-metals only: coin | bar | other (descriptive label).
--   unit_of_measure   precious-metals only: g | oz | kg (quantity unit; value math
--                     converts spot-per-troy-oz to this unit).

--> statement-breakpoint
ALTER TABLE budgeting.investments
  ADD COLUMN IF NOT EXISTS ui_type text,
  ADD COLUMN IF NOT EXISTS metal text,
  ADD COLUMN IF NOT EXISTS metal_kind text,
  ADD COLUMN IF NOT EXISTS unit_of_measure text;

--> statement-breakpoint
-- Backfill ui_type from the coarse holding_type for rows created before this migration.
UPDATE budgeting.investments SET ui_type = CASE
    WHEN holding_type = 'equities'    THEN 'equity'
    WHEN holding_type = 'etf'         THEN 'etf'
    WHEN holding_type = 'reit'        THEN 'reit'
    WHEN holding_type = 'crypto'      THEN 'crypto'
    WHEN holding_type = 'bond'        THEN 'treasury_bond'
    WHEN holding_type = 'commodity'   THEN 'precious_metals'
    WHEN holding_type = 'cash_fx'     THEN 'cash'
    WHEN holding_type = 'real_estate' THEN 'real_estate'
    ELSE 'other'
  END
  WHERE ui_type IS NULL;

--> statement-breakpoint
ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_ui_type_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_ui_type_chk
  CHECK (ui_type IS NULL OR ui_type IN (
    'equity','etf','etb','reit','crypto',
    'treasury_bond','collectibles','real_estate','other',
    'precious_metals','cash'
  ));

--> statement-breakpoint
ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_metal_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_metal_chk
  CHECK (metal IS NULL OR metal IN ('gold','silver','platinum'));

--> statement-breakpoint
ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_metal_kind_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_metal_kind_chk
  CHECK (metal_kind IS NULL OR metal_kind IN ('coin','bar','other'));

--> statement-breakpoint
ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_uom_chk;
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_uom_chk
  CHECK (unit_of_measure IS NULL OR unit_of_measure IN ('g','oz','kg'));
