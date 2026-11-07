-- 0109: the special "Investments" spendings category is gone (15-18 UAT, user).
--
-- WHY: investments are recorded as assets on the Wallets tab; a pinned spendings
-- category with a computed "income − other plans" limit is no longer needed.
-- Any row that was that category stays as an ordinary category, with its
-- spendings, limits and reserve_excluded flag as they are; only the marker and
-- its limit mode go.

DROP INDEX IF EXISTS "budgeting"."categories_one_investment_per_tenant";
--> statement-breakpoint
ALTER TABLE "budgeting"."categories"
  DROP CONSTRAINT IF EXISTS "categories_investment_limit_mode_chk";
--> statement-breakpoint
ALTER TABLE "budgeting"."categories" DROP COLUMN IF EXISTS "investment_limit_mode";
--> statement-breakpoint
ALTER TABLE "budgeting"."categories" DROP COLUMN IF EXISTS "is_investment";
