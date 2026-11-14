-- 0110: stored conversions into the budget's current currency (quick 20261112-fx-cache).
--
-- WHY: once a budget's currency changes, every read converted every old row
-- through fx_convert (~60µs a call): the Overview wealth chart went from 0.15s
-- to 1.2s. A row now keeps its amount in the budget currency next to the
-- currency it is in. Reads take it when that currency is the one asked for and
-- convert live otherwise, so a missing or outdated figure is slower, never wrong.
--
-- Only a figure that can no longer change is stored: the same currency, or the
-- exact rate of the row's own day once that day is before yesterday (today's
-- rate is re-fetched hourly; a gap in history may still be backfilled).
-- fx_cache_fill() picks up rows whose rate became final since.

ALTER TABLE "budgeting"."expense_ledger"
  ADD COLUMN IF NOT EXISTS "fx_cache_ccy" char(3),
  ADD COLUMN IF NOT EXISTS "fx_cache_cents" bigint;
--> statement-breakpoint
ALTER TABLE "budgeting"."budget_wealth_snapshots"
  ADD COLUMN IF NOT EXISTS "fx_cache_ccy" char(3),
  ADD COLUMN IF NOT EXISTS "fx_cache_capitalization_cents" bigint,
  ADD COLUMN IF NOT EXISTS "fx_cache_investment_value_cents" bigint,
  ADD COLUMN IF NOT EXISTS "fx_cache_investment_cost_basis_cents" bigint;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION budgeting.fx_convert_final(cents bigint, src text, dst text, on_date date)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN cents IS NULL OR src IS NULL OR dst IS NULL THEN NULL
    WHEN src = dst THEN cents
    WHEN on_date < current_date - 1 THEN
      (SELECT round(cents * r.rate)::bigint FROM budgeting.fx_rates r
        WHERE r.base = src::bpchar AND r.quote = dst::bpchar AND r.date = on_date)
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION budgeting.ledger_fx_cache() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dst text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.fx_cache_ccy IS NOT NULL
     AND NEW.fx_cache_ccy IS NOT DISTINCT FROM OLD.fx_cache_ccy
     AND NEW.amount_original_cents = OLD.amount_original_cents
     AND NEW.currency_original = OLD.currency_original
     AND NEW.transaction_date = OLD.transaction_date THEN
    RETURN NEW;
  END IF;
  SELECT default_currency INTO dst FROM tenancy.budgets WHERE id = NEW.budget_id;
  NEW.fx_cache_cents := budgeting.fx_convert_final(NEW.amount_original_cents, NEW.currency_original, dst, NEW.transaction_date);
  NEW.fx_cache_ccy := CASE WHEN NEW.fx_cache_cents IS NULL THEN NULL ELSE dst END;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS expense_ledger_fx_cache ON budgeting.expense_ledger;
--> statement-breakpoint
CREATE TRIGGER expense_ledger_fx_cache BEFORE INSERT OR UPDATE ON budgeting.expense_ledger
  FOR EACH ROW EXECUTE FUNCTION budgeting.ledger_fx_cache();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION budgeting.snapshot_fx_cache() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE dst text; d date := NEW.captured_at::date;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.fx_cache_ccy IS NOT NULL
     AND NEW.fx_cache_ccy IS NOT DISTINCT FROM OLD.fx_cache_ccy
     AND NEW.capitalization_cents = OLD.capitalization_cents
     AND NEW.investment_value_cents = OLD.investment_value_cents
     AND NEW.investment_cost_basis_cents IS NOT DISTINCT FROM OLD.investment_cost_basis_cents
     AND NEW.currency = OLD.currency
     AND NEW.captured_at = OLD.captured_at THEN
    RETURN NEW;
  END IF;
  SELECT default_currency INTO dst FROM tenancy.budgets WHERE id = NEW.budget_id;
  NEW.fx_cache_capitalization_cents := budgeting.fx_convert_final(NEW.capitalization_cents, NEW.currency, dst, d);
  NEW.fx_cache_investment_value_cents := budgeting.fx_convert_final(NEW.investment_value_cents, NEW.currency, dst, d);
  NEW.fx_cache_investment_cost_basis_cents := budgeting.fx_convert_final(NEW.investment_cost_basis_cents, NEW.currency, dst, d);
  -- All or nothing: a NULL cost basis is a real NULL only when the source is one.
  NEW.fx_cache_ccy := CASE WHEN NEW.fx_cache_capitalization_cents IS NULL THEN NULL ELSE dst END;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS budget_wealth_snapshots_fx_cache ON budgeting.budget_wealth_snapshots;
--> statement-breakpoint
CREATE TRIGGER budget_wealth_snapshots_fx_cache BEFORE INSERT OR UPDATE ON budgeting.budget_wealth_snapshots
  FOR EACH ROW EXECUTE FUNCTION budgeting.snapshot_fx_cache();
--> statement-breakpoint
-- Rows that can be stored now but are not, or are stored in another currency.
-- Setting fx_cache_ccy to NULL makes the BEFORE trigger store them again.
CREATE OR REPLACE FUNCTION budgeting.fx_cache_fill(p_budget uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE dst text; n integer; m integer;
BEGIN
  SELECT default_currency INTO dst FROM tenancy.budgets WHERE id = p_budget;
  IF dst IS NULL THEN RETURN 0; END IF;
  UPDATE budgeting.expense_ledger l SET fx_cache_ccy = NULL
   WHERE l.budget_id = p_budget
     AND l.fx_cache_ccy IS DISTINCT FROM dst::bpchar
     AND budgeting.fx_convert_final(l.amount_original_cents, l.currency_original, dst, l.transaction_date) IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE budgeting.budget_wealth_snapshots s SET fx_cache_ccy = NULL
   WHERE s.budget_id = p_budget
     AND s.fx_cache_ccy IS DISTINCT FROM dst::bpchar
     AND budgeting.fx_convert_final(s.capitalization_cents, s.currency, dst, s.captured_at::date) IS NOT NULL;
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tenancy.budget_fx_cache_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE budgeting.expense_ledger SET fx_cache_ccy = NULL WHERE budget_id = NEW.id;
  UPDATE budgeting.budget_wealth_snapshots SET fx_cache_ccy = NULL WHERE budget_id = NEW.id;
  RETURN NULL;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS budgets_fx_cache_refresh ON tenancy.budgets;
--> statement-breakpoint
CREATE TRIGGER budgets_fx_cache_refresh AFTER UPDATE OF default_currency ON tenancy.budgets
  FOR EACH ROW WHEN (OLD.default_currency IS DISTINCT FROM NEW.default_currency)
  EXECUTE FUNCTION tenancy.budget_fx_cache_refresh();
