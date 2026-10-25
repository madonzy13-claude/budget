-- 0086: a holding's current price keeps sub-cent precision.
--
-- WHY (user, 261023): typing a TOTAL of 170 for 3 units stored a unit price of
-- 56.67 (whole cents), so the row read back 3 × 56.67 = 169.98. No whole-cent
-- unit price multiplies back to 170. Six places of sub-cent do:
-- 3 × 5666.666667 = 17000.000001 → 17000.
--
-- Widening bigint → numeric is lossless for every existing row.
ALTER TABLE budgeting.investments
  ALTER COLUMN current_price_cents TYPE numeric(24, 6);
