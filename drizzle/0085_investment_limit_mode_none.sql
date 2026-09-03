-- 0085: a third investment limit mode — 'none' (no limit), and the new default.
--
-- WHY: the Investments category had 'manual' | 'smart' only, and 'smart' was
-- assigned at creation (category-repo ensureInvestmentCategory). So every user
-- who never opened the dialog carried a computed limit they never chose. Worse,
-- the smart limit is computed ON READ and never lands in category_limits, so
-- the money forecast saw a category with a plan of zero and read every złoty
-- put into it as overspend.
--
-- 'none' behaves exactly like a normal category's no-limit. It is expressed
-- through the SAME column normal categories use — category_limits.no_limit —
-- so the grid's dash, the spendings summary, the reserve engine and the
-- cash-flow projection all treat the category correctly with no knowledge that
-- it is the investment one.
--
-- MIGRATION SCOPE (decided with the user, 260901): only rows currently on
-- 'smart' move to 'none'. 'smart' was the automatic default, never a choice.
-- 'manual' IS a choice — one budget has a deliberately typed limit — so those
-- rows keep both their mode and their amount.

ALTER TABLE "budgeting"."categories"
  DROP CONSTRAINT IF EXISTS "categories_investment_limit_mode_chk";

ALTER TABLE "budgeting"."categories"
  ADD CONSTRAINT "categories_investment_limit_mode_chk"
  CHECK ("investment_limit_mode" IS NULL
         OR "investment_limit_mode" IN ('manual', 'smart', 'none'));

-- The migrator role is NOBYPASSRLS and both tables are FORCE'd, so a plain
-- migrator UPDATE matches ZERO rows and reports success — the trap that made
-- the first run of this migration change the constraint and silently skip
-- every row. Drop FORCE for the data statements and put it back after;
-- post-migration.sql re-asserts it too, as a second belt.
ALTER TABLE "budgeting"."categories" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budgeting"."category_limits" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- tenancy.budgets too: the INSERT below JOINs it for the default currency, and
-- a FORCE'd table on the READ side of an INSERT..SELECT silences the whole
-- statement just as thoroughly as one on the write side.
ALTER TABLE "tenancy"."budgets" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

UPDATE "budgeting"."categories"
   SET "investment_limit_mode" = 'none'
 WHERE "is_investment"
   AND "investment_limit_mode" = 'smart';

-- Carry the mode into the flag the rest of the app reads. Only the OPEN SCD-2
-- row: closed rows describe months that really did have that limit, and
-- rewriting them would retroactively change past forecasts and reserve replays.
UPDATE "budgeting"."category_limits" cl
   SET "no_limit" = true
  FROM "budgeting"."categories" c
 WHERE c."id" = cl."category_id"
   AND c."is_investment"
   AND c."investment_limit_mode" = 'none'
   AND cl."effective_to" IS NULL;

-- An investment category with no limit row at all would read as no_limit=false
-- (the repo's default for a missing row) and show a number where the dash
-- belongs. Give those an open row that says what the mode says.
INSERT INTO "budgeting"."category_limits"
  (id, tenant_id, category_id, normal_amount, normal_currency,
   cushion_amount, cushion_currency, effective_from, effective_to,
   no_limit, actor_user_id, created_at)
SELECT gen_random_uuid(), c.tenant_id, c.id, 0, b.default_currency,
       0, b.default_currency, date_trunc('month', now())::date, NULL,
       true, c.actor_user_id, now()
  FROM "budgeting"."categories" c
  JOIN "tenancy"."budgets" b ON b.id = c.tenant_id
 WHERE c."is_investment"
   AND c."investment_limit_mode" = 'none'
   AND NOT EXISTS (
     SELECT 1 FROM "budgeting"."category_limits" x
      WHERE x.category_id = c.id AND x.effective_to IS NULL
   );

--> statement-breakpoint
ALTER TABLE "budgeting"."categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budgeting"."category_limits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenancy"."budgets" FORCE ROW LEVEL SECURITY;
