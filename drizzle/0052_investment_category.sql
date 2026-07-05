-- r33: smart "Investments" spendings category.
--
-- WHY: a special, non-deletable category pinned first in the spendings grid that
-- tracks how much the family has actually invested. It has no needs/wants and no
-- cushion; its planned limit is either MANUAL (user types a value) or SMART
-- (computed on read = monthly income − Σ planned of every other active category).
-- It is also excluded from all reserve math (reserve_excluded set true on create).
--
-- Two nullable columns on the existing categories table (no destructive change):
--   is_investment          — marks THE investment category (default false).
--   investment_limit_mode  — 'manual' | 'smart' (NULL for normal categories).
--
-- A partial unique index guarantees at most ONE investment category per budget
-- (tenant). It covers archived rows too, so turning the feature off (archive) and
-- back on (unarchive) reuses the same row rather than creating a duplicate.

ALTER TABLE "budgeting"."categories"
  ADD COLUMN IF NOT EXISTS "is_investment" boolean NOT NULL DEFAULT false;

ALTER TABLE "budgeting"."categories"
  ADD COLUMN IF NOT EXISTS "investment_limit_mode" text;

ALTER TABLE "budgeting"."categories"
  DROP CONSTRAINT IF EXISTS "categories_investment_limit_mode_chk";
ALTER TABLE "budgeting"."categories"
  ADD CONSTRAINT "categories_investment_limit_mode_chk"
  CHECK ("investment_limit_mode" IS NULL
         OR "investment_limit_mode" IN ('manual', 'smart'));

CREATE UNIQUE INDEX IF NOT EXISTS "categories_one_investment_per_tenant"
  ON "budgeting"."categories" ("tenant_id")
  WHERE "is_investment";
