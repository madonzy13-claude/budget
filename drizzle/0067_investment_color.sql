-- 0067_investment_color.sql
-- Per-item `color` for possessions (icon + color picker, same as wallets). Stored
-- as a raw hex string (e.g. '#e63946'); NULL for every holding without a color.
-- Idempotent.
ALTER TABLE budgeting.investments ADD COLUMN IF NOT EXISTS color text;
