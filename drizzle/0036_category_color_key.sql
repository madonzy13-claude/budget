-- 260613-v1p: persist per-category color
--
-- WHY: the add/edit-category popup let users pick a color, but the chosen key was
-- never stored — createCategorySchema dropped colorKey, no repo SELECTed it, and
-- get-spendings-summary read a dead `(c as any).colorKey` that was always null. To
-- render the 4px left accent bar on spendings columns + reserves rows the color must
-- first be persisted end-to-end. This migration adds the missing column.
--
-- Nullable, no default, no destructive change. NULL = no color = no bar (the
-- current look). Values are constrained at the API/zod layer to the 8 known keys
-- (yellow/green/blue/red/orange/purple/pink/gray); the DB stays a plain text column
-- so future palette changes need no migration.
--
-- icon_key is intentionally NOT added: there was never an icon column and the icon
-- picker is being removed entirely (frontend-only).

ALTER TABLE "budgeting"."categories"
  ADD COLUMN IF NOT EXISTS "color_key" text;
