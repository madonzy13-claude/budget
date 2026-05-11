---
phase: 02-budgeting-fx
plan: "02"
subsystem: budgeting/fx
tags: [fx, frankfurter, pg-boss, drizzle, schema-push, acl]
dependency_graph:
  requires: [02-01-PLAN.md]
  provides: [FxProvider-impl, fx_rates-table, fx-daily-fetch-cron, GET-/fx/rate]
  affects: [02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09]
tech_stack:
  added:
    - FrankfurterFxProvider (adapters/fx/frankfurter.ts)
    - DrizzleFxRateCacheRepo (adapters/persistence/fx-rate-cache-repo.ts)
    - pg-boss daily fetcher (apps/worker/src/handlers/fx-daily-fetch.ts)
    - GET /fx/rate HTTP route (apps/api/src/routes/fx.ts)
  patterns:
    - Cache-then-live-then-stale (D-03-b)
    - ENGR-09 ACL: number->string at adapter boundary
    - No-RLS reference table with GRANT-only access control
key_files:
  created:
    - packages/budgeting/src/adapters/persistence/fx-rates-schema.ts
    - packages/budgeting/src/adapters/persistence/fx-rate-cache-repo.ts
    - packages/budgeting/src/ports/fx-rate-cache-repo.ts
    - packages/budgeting/src/adapters/fx/format-date-utc.ts
    - packages/budgeting/src/adapters/fx/frankfurter.ts
    - apps/worker/src/handlers/fx-daily-fetch.ts
    - apps/api/src/routes/fx.ts
    - packages/budgeting/test/frankfurter-adapter.test.ts
    - packages/budgeting/test/fx-rate-cache-repo.test.ts
    - apps/api/test/routes/fx.test.ts
    - apps/worker/test/handlers/fx-daily-fetch.test.ts
    - drizzle/0005_daily_dust.sql
    - drizzle/0006_rainy_anita_blake.sql
  modified:
    - packages/budgeting/src/contracts/factory.ts
    - packages/budgeting/src/adapters/persistence/supported-currencies-schema.ts
    - packages/budgeting/package.json
    - apps/migrator/drizzle.config.ts
    - apps/migrator/post-migration.sql
    - apps/api/src/boot.ts
    - apps/api/src/app.ts
    - apps/api/package.json
    - apps/worker/src/worker.ts
    - apps/worker/package.json
decisions:
  - "FxRateCacheRepo port uses string for rate/date (not number/Date) to keep the adapter boundary clean and avoid Drizzle/Temporal leaking into domain"
  - "Chose workerPool() for DrizzleFxRateCacheRepo in both API boot and worker.ts so worker_role INSERT/UPDATE permissions are available everywhere the cache is written"
  - "supported_currencies.iso_code changed to VARCHAR(10) (from CHAR(3)) to accommodate 4-char crypto codes (USDT, USDC, BNIB, SOL)"
  - "Test cleanup uses migrator_role (DELETE) while test execution uses worker_role (INSERT/SELECT/UPDATE) — matching real permission model"
  - "bootstrapSupportedCurrencies() in boot.ts uses worker_role pool (INSERT on supported_currencies); swallows errors (best-effort)"
  - "cron '0 17 * * *' (5 fields, Europe/Berlin) chosen — matches Frankfurter publish time ~16:00 CET"
metrics:
  duration: "~55 minutes"
  completed: "2026-05-09"
  tasks_completed: 4
  files_created: 13
  files_modified: 11
---

# Phase 02 Plan 02: Frankfurter FX Adapter + fx_rates Schema + Daily Fetcher Summary

One-liner: Frankfurter FX adapter with cache-then-live-then-stale semantics, budgeting.fx_rates table with no-RLS GRANT-only ACL, pg-boss daily cron at 17:00 CET, and GET /fx/rate HTTP endpoint.

## What Shipped

### Task 1: fx_rates schema + repo + GRANTs + supported_currencies seed

- `budgeting.fx_rates` Drizzle table: PK (base CHAR(3), quote CHAR(3), date DATE); no `pgPolicy()` — GRANT-restricted reference data
- `FxRateCacheRepo` port: `lookup`, `upsert`, `mostRecentPrior` — all string-typed for rate/date values
- `DrizzleFxRateCacheRepo` adapter: raw SQL via Drizzle `sql` tagged template; no RLS GUC needed
- post-migration.sql: GRANTs (SELECT→app_role+worker_role, INSERT/UPDATE→worker_role only), seed 8 fiat + 6 crypto currencies
- drizzle.config.ts updated to include budgeting persistence schemas
- Migration 0005 (creates tables) + 0006 (ALTER iso_code to VARCHAR(10)) applied to dev DB

### Task 2: FrankfurterFxProvider (ENGR-09 ACL)

- `FrankfurterFxProvider implements FxProvider` — locked port signature untouched
- `formatDateUTC()` — UTC-safe YYYY-MM-DD formatter (avoids timezone pitfalls)
- `NoFxRateAvailable` error class (triggers 503 in HTTP route)
- ENGR-09 ACL boundary: `String(j.rate)` converts Frankfurter's `number` to `string` before returning — number type never crosses into domain
- Cache-then-live-then-stale algorithm with Pitfall 4 (weekend/holiday rollback isStale=true)
- `createBudgetingModule()` factory updated to accept `{ fxCache }` and return `{ fxProvider }`

### Task 3: Daily fetcher + GET /fx/rate + bootstrapSupportedCurrencies

- `registerFxDailyFetch(boss, fxProvider)` — pg-boss handler that collects distinct currency pairs from `expense_ledger` and calls `fxProvider.rateAsOf` for each
- `worker.ts` registers queue + schedule `'0 17 * * *'` Europe/Berlin (5-placeholder cron, Pitfall 9 compliant)
- `GET /fx/rate?from=&to=&date=` returns `{rate, fxRateDate, provider, isStale}`, 503 on `NoFxRateAvailable`, 400 on invalid query
- `bootstrapSupportedCurrencies()` in `boot.ts`: best-effort Frankfurter /v2/currencies UPSERT on API startup
- `/fx` route mounted in `app.ts` after `tenantGuard` (requires auth)

### Task 4: Schema push to dev DB

- `bun run --filter='@budget/migrator' migrate` applied migrations 0005 + 0006 successfully
- `budgeting.fx_rates` and `budgeting.supported_currencies` confirmed in dev DB
- GRANTs verified: `has_table_privilege('app_role', 'budgeting.fx_rates', 'SELECT')=t`, INSERT=f (correct)
- 6 CRYPTO currencies seeded (BTC, ETH, USDT, USDC, BNB, SOL)

## Test Results

```
packages/budgeting/test/frankfurter-adapter.test.ts  — 8/8 pass
packages/budgeting/test/fx-rate-cache-repo.test.ts   — 4/4 pass
apps/api/test/routes/fx.test.ts                      — 4/4 pass
apps/worker/test/handlers/fx-daily-fetch.test.ts     — 2/2 pass
Total: 18/18 pass

@budget/budgeting full suite: 41/41 pass
@budget/api full suite:       17/17 pass
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] supported_currencies.iso_code CHAR(3) too short for crypto codes**

- **Found during:** Task 1 — post-migration.sql seeding failed with Postgres error 22001 (value too long for type character(3))
- **Issue:** The Wave-1 schema defined `iso_code char(3)` but the plan seeds USDT/USDC/BNB/SOL (4-char codes)
- **Fix:** Changed to `varchar(10)` in `supported-currencies-schema.ts`; applied direct `ALTER TABLE` to live DB; drizzle-kit generated migration 0006 to sync
- **Files modified:** `packages/budgeting/src/adapters/persistence/supported-currencies-schema.ts`, `drizzle/0005_daily_dust.sql`, `drizzle/0006_rainy_anita_blake.sql`
- **Commits:** 4b661bc

**2. [Rule 2 - Security] Test isolation uses migrator_role for cleanup**

- **Found during:** Task 1 test run — `app_role` (and `worker_role`) lack DELETE permission on fx_rates (by design)
- **Fix:** Test `beforeAll`/`afterAll` use `DATABASE_URL_MIGRATOR` pool for DELETE cleanup; `DATABASE_URL_WORKER` pool for INSERT/SELECT/UPDATE
- **Files modified:** `packages/budgeting/test/fx-rate-cache-repo.test.ts`

**3. [Rule 3 - Blocking] @budget/budgeting subpath exports missing**

- **Found during:** Task 3 — `apps/api/src/routes/fx.ts` imports `@budget/budgeting/src/adapters/fx/frankfurter` which wasn't exported
- **Fix:** Added 4 subpath exports to `packages/budgeting/package.json`
- **Files modified:** `packages/budgeting/package.json`

## Key Decisions

- **FxProvider port uses string types throughout** — `rate: string`, `date: string` at all boundaries. Frankfurter's `number` is converted to `string` at adapter entry (`String(j.rate)`) per ENGR-09. This is the canonical pattern for Money-related values crossing adapter boundaries.
- **Cache table location: budgeting schema, no RLS** — fx_rates is reference data shared across all tenants. RLS would require a tenant context that doesn't exist for infrastructure-level queries. GRANT-only access control (T-2-02-01).
- **Cron: `0 17 * * *` Europe/Berlin** — 5-field pg-boss cron (no seconds prefix per Pitfall 9). 17:00 CET/CEST gives 1-hour margin after Frankfurter publishes (~16:00 CET).
- **Bootstrap currency seed: 8 fiat + 6 crypto** — SQL-only, no HTTP in post-migration.sql. Full Frankfurter list bootstrapped at API startup via `bootstrapSupportedCurrencies()`.

## Known Stubs

None — all data flows are wired:

- `fxProvider.rateAsOf()` hits real cache then real Frankfurter API (with fetch injection for testing)
- Cache repo uses real Postgres (no in-memory mock in production path)
- Daily fetcher collects real pairs from `expense_ledger` (empty in dev; passes 0 pairs silently)

## Threat Surface Scan

No new trust boundaries beyond those in the plan's threat model:

- T-2-02-01 (worker_role INSERT-only): implemented and verified via `has_table_privilege`
- T-2-02-06 (ENGR-09 ACL): `String(j.rate)` at boundary + explicit type assertion test

## Enablement for Next Wave (02-03+)

Downstream plans can now:

1. Call `fxProvider.rateAsOf(base, quote, date)` from any service that has a `FrankfurterFxProvider` injected
2. Use `seedFxRate()` helper in `test/helpers.ts` for integration test fixtures (now that `budgeting.fx_rates` exists)
3. Hit `GET /fx/rate?from=USD&to=PLN&date=YYYY-MM-DD` from the web app for deposit FX preview (EXPN-13)
4. Reference `budgeting.supported_currencies` for currency picker dropdowns (02-01 schema + 02-02 GRANTs applied)

## Self-Check: PASSED

All created files verified present. All commits verified in git log.

### must_haves.truths verification

| Truth                                                                                         | Status |
| --------------------------------------------------------------------------------------------- | ------ |
| FrankfurterFxProvider implements FxProvider port without modifying locked signature (ENGR-09) | PASS   |
| Cache hit isStale=false; cache miss + live success; Pitfall 4 weekend rollback isStale        | PASS   |
| Live failure → mostRecentPrior fallback isStale=true; both miss → NoFxRateAvailable           | PASS   |
| Daily pg-boss job at `0 17 * * *` Europe/Berlin                                               | PASS   |
| GET /fx/rate returns {rate, fxRateDate, provider, isStale}                                    | PASS   |
| fx_rates: no RLS, GRANT SELECT→app_role+worker_role, GRANT INSERT/UPDATE→worker_role only     | PASS   |

### must_haves.artifacts verification

| Artifact           | Contains                | Status |
| ------------------ | ----------------------- | ------ |
| fx-rates-schema.ts | `fxRates` (no pgPolicy) | PASS   |
| frankfurter.ts     | `implements FxProvider` | PASS   |
| fx-daily-fetch.ts  | `fx-daily-fetch` queue  | PASS   |
| routes/fx.ts       | `/rate` endpoint        | PASS   |
| post-migration.sql | `fx_rates` GRANTs       | PASS   |

### key_links verification

| Link                                                                      | Status                    |
| ------------------------------------------------------------------------- | ------------------------- |
| frankfurter.ts → frankfurter.dev/v2/rate                                  | PASS (fetch call present) |
| fx-daily-fetch.ts → fx-rate-cache-repo via fxProvider.rateAsOf (indirect) | PASS                      |
| routes/fx.ts → fxProvider.rateAsOf                                        | PASS                      |
