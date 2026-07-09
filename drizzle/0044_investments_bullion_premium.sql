-- Phase 9.2: bullion premium for precious-metals holdings.
-- A coin/bar resells ABOVE spot; premium_pct (percent, e.g. 20.000 = +20%) is
-- applied to the CURRENT (resale) value only — the buy price already carries the
-- user's acquisition premium. NULL = no premium (melt/spot value). Idempotent.

--> statement-breakpoint
ALTER TABLE budgeting.investments
  ADD COLUMN IF NOT EXISTS premium_pct numeric(6,3);
