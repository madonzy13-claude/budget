-- 0104: multi-currency budgets foundation (Phase 14).
--
-- WHY: the budget currency becomes changeable and every category carries its own
-- currency. Amounts are re-expressed at READ time from amount_original_cents +
-- currency_original + the row's own date — the append-only ledger is never
-- rewritten (A→B→A stays lossless).
--
--   * categories.currency (D-04): backfilled with the budget's current currency;
--     a BEFORE INSERT trigger fills it the same way when an INSERT omits it.
--   * category_reserve_adjustments.currency (D-10/D-17): an adjustment converts
--     from its own currency at its own date; backfilled with the budget currency
--     (every adjustment so far was written in it), new rows take their
--     category's currency.
--   * budgeting.fx_convert(): the ONE place read-time conversion rounds and
--     falls back. Rate on the date, else most recent prior, else earliest;
--     NULL for a pair with no history (never a fabricated rate 1). round(numeric)
--     is half away from zero = Big.roundHalfUp, so refunds mirror payments.
--     fx_rates.base/quote are char(3): the ::bpchar casts keep the PK index in
--     play (78.9 s seq scan vs 23 ms measured on dev, 2026-11-03).
--
-- FORCE RLS is lifted on the backfilled/JOINed tables (the migrator has no
-- BYPASSRLS; an unseeable JOIN silently updates 0 rows — 260803) and restored.

--> statement-breakpoint
ALTER TABLE budgeting.categories NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.category_reserve_adjustments NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE tenancy.budgets NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.category_limits NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.categories ADD COLUMN IF NOT EXISTS currency char(3);

--> statement-breakpoint
UPDATE budgeting.categories c
   SET currency = b.default_currency
  FROM tenancy.budgets b
 WHERE b.id = c.tenant_id AND c.currency IS NULL;

--> statement-breakpoint
ALTER TABLE budgeting.categories ALTER COLUMN currency SET NOT NULL;

--> statement-breakpoint
-- Review WR-09: until now a limit row's currency was write-only metadata — the
-- old route fell back to 'USD' and unarchive to 'EUR' — and its amounts were in
-- the budget currency whatever the column said. Reads convert FROM it from here
-- on, so a mislabelled row is relabelled to its category's currency (= the
-- budget's, just backfilled). Amounts stay: they always meant that currency.
-- Safe only HERE, before a category currency change can make a mismatch real.
UPDATE budgeting.category_limits cl
   SET normal_currency = c.currency, cushion_currency = c.currency
  FROM budgeting.categories c
 WHERE c.id = cl.category_id
   AND (cl.normal_currency <> c.currency OR cl.cushion_currency <> c.currency);

--> statement-breakpoint
ALTER TABLE budgeting.category_reserve_adjustments ADD COLUMN IF NOT EXISTS currency char(3);

--> statement-breakpoint
UPDATE budgeting.category_reserve_adjustments a
   SET currency = b.default_currency
  FROM tenancy.budgets b
 WHERE b.id = a.tenant_id AND a.currency IS NULL;

--> statement-breakpoint
ALTER TABLE budgeting.category_reserve_adjustments ALTER COLUMN currency SET NOT NULL;

--> statement-breakpoint
-- Fill an omitted currency at INSERT time (runs as the inserting role, inside
-- its tenant GUC, so the budget / category row is visible under RLS).
CREATE OR REPLACE FUNCTION budgeting.categories_default_currency() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.currency IS NULL THEN
    SELECT b.default_currency INTO NEW.currency
      FROM tenancy.budgets b WHERE b.id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
DROP TRIGGER IF EXISTS categories_default_currency_trigger ON budgeting.categories;

--> statement-breakpoint
CREATE TRIGGER categories_default_currency_trigger
BEFORE INSERT ON budgeting.categories
FOR EACH ROW EXECUTE FUNCTION budgeting.categories_default_currency();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION budgeting.reserve_adjustments_default_currency() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.currency IS NULL THEN
    SELECT c.currency INTO NEW.currency
      FROM budgeting.categories c WHERE c.id = NEW.category_id;
  END IF;
  RETURN NEW;
END $$;

--> statement-breakpoint
DROP TRIGGER IF EXISTS reserve_adjustments_default_currency_trigger
  ON budgeting.category_reserve_adjustments;

--> statement-breakpoint
CREATE TRIGGER reserve_adjustments_default_currency_trigger
BEFORE INSERT ON budgeting.category_reserve_adjustments
FOR EACH ROW EXECUTE FUNCTION budgeting.reserve_adjustments_default_currency();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION budgeting.fx_convert(cents bigint, src text, dst text, on_date date)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN src = dst THEN cents
    ELSE round(cents * COALESCE(
      (SELECT r.rate FROM budgeting.fx_rates r
        WHERE r.base = src::bpchar AND r.quote = dst::bpchar AND r.date <= on_date
        ORDER BY r.date DESC LIMIT 1),
      (SELECT r.rate FROM budgeting.fx_rates r
        WHERE r.base = src::bpchar AND r.quote = dst::bpchar
        ORDER BY r.date ASC LIMIT 1)))::bigint
  END
$$;

--> statement-breakpoint
GRANT EXECUTE ON FUNCTION budgeting.fx_convert(bigint, text, text, date) TO app_role, worker_role;

--> statement-breakpoint
ALTER TABLE budgeting.categories FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.category_reserve_adjustments FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE tenancy.budgets FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.category_limits FORCE ROW LEVEL SECURITY;
