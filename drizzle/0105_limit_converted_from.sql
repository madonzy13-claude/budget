-- 0105: remember what a currency-converted limit came from (Phase 14 gap).
--
-- WHY: changing a category's currency converts its current + future limit
-- segments at today's rate. Converting back re-converted the converted figure,
-- and with 4-decimal rates PLN 200 → EUR → PLN came back as 200.20 (user,
-- 261103). A converted segment now keeps the amounts + currency it was made
-- from; converting back restores them exactly, converting elsewhere starts from
-- them. Any limit the user writes clears it (that becomes the new basis).
-- Plain nullable column — no backfill, no RLS change (table-level grants apply).

--> statement-breakpoint
ALTER TABLE budgeting.category_limits ADD COLUMN IF NOT EXISTS converted_from jsonb;
