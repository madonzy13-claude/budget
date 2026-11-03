---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 01
subsystem: db
tags: [migration, fx, read-time-conversion]
key-files:
  created:
    - drizzle/0104_multi_currency.sql
    - packages/budgeting/src/adapters/persistence/fx-sql.ts
    - packages/budgeting/test/fx-seed.ts
    - packages/budgeting/test/adapters/fx-convert-fn.test.ts
    - packages/budgeting/test/adapters/category-currency-defaults.test.ts
    - apps/api/test/schema/multi-currency-0104.test.ts
  modified:
    - drizzle/meta/_journal.json
    - apps/migrator/post-migration.sql
    - packages/budgeting/src/adapters/persistence/categories-schema.ts
    - packages/budgeting/src/adapters/persistence/category-reserve-adjustments-schema.ts
    - packages/budgeting/src/adapters/persistence/category-reserve-adjustments-repo.ts
    - packages/shared-kernel/src/money.ts
requirements-completed: [D-04]
---

# 14-01 Summary: migration 0104 — fx_convert + category / adjustment currency

- `budgeting.fx_convert(cents, src, dst, on_date)` (LANGUAGE sql STABLE): same ccy → cents; rate on date → else most recent prior → else earliest; unknown pair → NULL. `round(numeric)` = half away from zero (= `Big.roundHalfUp`). `::bpchar` casts on both sides keep the fx_rates PK in play. EXECUTE granted to app_role + worker_role (0104 and post-migration.sql).
- `categories.currency` / `category_reserve_adjustments.currency` char(3) NOT NULL, backfilled from `tenancy.budgets.default_currency` with FORCE RLS lifted on all three tables and restored.
- Adjustment repo INSERT writes `currency = (SELECT currency FROM categories WHERE id = category_id)`.
- `fx-sql.ts`: `fxConvert()` and `limitRateDate(monthEnd, today)` (= `LEAST(month_end, today)`, `today` always bound from serverNow()).
- `FIAT_CURRENCIES` (8) in shared-kernel money.ts.

## Verification
- RED (7e52639f): 15 fail / 1 pass — "function budgeting.fx_convert(...) does not exist", "column currency ... does not exist".
- GREEN: fx-convert-fn + category-currency-defaults + multi-currency-0104 → 18 pass / 0 fail (incl. perf: grouped SUM over the largest dev budget (862 rows) < 500 ms as app_role). Adjacent suites reserve-event-loader-repo, reserve-topup, account-deletion-cascade → 21 / 0.
- Migrator image rebuilt, `make migrate` → complete. psql as postgres:
  - (a) `to_regprocedure` → `fx_convert(bigint,text,text,date)`
  - (b) categories.currency NO, category_reserve_adjustments.currency NO
  - (c) categories whose currency ≠ budget: 0 (219 categories); adjustments ≠ budget: 0
  - (d) relforcerowsecurity budgets / categories / category_reserve_adjustments: t / t / t
  - (e) has_function_privilege app_role t, worker_role t
- `make build-api`, `make build-worker` → recreated, healthy; `/api/health` 200. `bunx tsc --noEmit -p packages/budgeting` clean.

## Deviations
- [Rule 3 – blocking] Added BEFORE INSERT triggers that fill an omitted currency (category ← its budget's currency, D-04; adjustment ← its category's). Without them NOT NULL broke 55 raw category INSERTs in tests and live create-category until plan 05 wires the column through.
- Perf/EXPLAIN check: fx_convert contains sub-selects, so Postgres does not inline it — the "no Seq Scan on fx_rates" EXPLAIN assertion is weak; the < 500 ms timing is the real gate.
- `make build-web` deferred to plan 04 (first web plan); this plan only adds a shared-kernel constant the web does not read yet.

## Self-Check: PASSED
