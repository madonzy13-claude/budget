---
phase: 05-reserves-wallets-tabs
plan: 11
subsystem: budgeting
tags:
  [reserves, persistence, migration, replay-on-read, event-loader, hex-adapter]
requires:
  - "reserve-engine.ts (05-09/05-10) — the keystone engine that consumes ReserveEngineEvent[]"
  - "category_reserve_adjustments, budget_mode_history, category_limits, RESERVE wallets (kept)"
provides:
  - "ReserveEventLoaderRepo port (clean, no Drizzle) returning the 8 raw ReserveEventInputs"
  - "Drizzle event-loader adapter composing transactionRepo + categoryLimitRepo + reservesSummaryRepo + in-adapter SQL"
  - "Live DB reset to the replay-on-read shape (no reserve_actual_cents, no category_reserve_balance VIEW)"
affects:
  - "05-12 orchestrator (maps ReserveEventInputs → ReserveEngineEvent[])"
  - "05-13/05-16 cleanup waves (remove reserve-balance-repo + createReserveBalanceRepo references)"
tech-stack:
  added: []
  patterns:
    - "Replay-on-read reserve persistence (decision A/B): event loader instead of precomputed-balance VIEW"
    - "Drizzle adapter composes existing ports (no re-implemented spend/limit/wallet SQL)"
    - "TZ-correct open-month resolution via Temporal.PlainYearMonth (mirrors getReservePositions)"
key-files:
  created:
    - "drizzle/0030_phase05_reserve_model_reset.sql"
    - "packages/budgeting/src/ports/reserve-event-loader-repo.ts"
    - "packages/budgeting/src/adapters/persistence/reserve-event-loader-repo.ts"
    - "packages/budgeting/test/adapters/reserve-event-loader-repo.test.ts"
  modified:
    - "drizzle/meta/_journal.json (idx-30 entry)"
    - "packages/budgeting/src/adapters/persistence/categories-schema.ts (removed reserveActualCents)"
    - "apps/migrator/post-migration.sql (removed orphaned GRANT on dropped VIEW)"
decisions:
  - "Decision B (reset & rebuild): dropped reserve_actual_cents + category_reserve_balance VIEW; pre-authorized in 05-REWRITE-SPEC.md."
  - "Event loader returns RAW ordered events (not ReserveEngineEvent[]); raw→event mapping lives in the 05-12 orchestrator."
  - "Read-only placeholder actor for the GUC is UserId(tenantId) (valid UUID), matching reserves-summary-repo — not UserId('system') which fails uuid validation on tenancy.budgets RLS."
metrics:
  duration_min: 10
  completed: 2026-06-05
  tasks_completed: 3
  files_touched: 7
  commits: 4
---

# Phase 05 Plan 11: Reset Reserve Persistence + Event-Loader Repo Summary

Reset the reserve persistence to the replay-on-read model (decision B): dropped the dead `reserve_actual_cents` column and the `category_reserve_balance` expected-accrual VIEW via migration 0030 (applied to the live DB so Drizzle types regenerate from the new shape), and added a clean `ReserveEventLoaderRepo` port + Drizzle adapter that returns the 8 ordered raw `ReserveEventInputs` the keystone `reserve-engine.ts` consumes — replacing the VIEW-based reads.

## What was built

- **Migration 0030** (`drizzle/0030_phase05_reserve_model_reset.sql`): `DROP VIEW IF EXISTS budgeting.category_reserve_balance` + `ALTER TABLE budgeting.categories DROP COLUMN IF EXISTS reserve_actual_cents`, both IF-EXISTS guarded (idempotent). Mirrors the 0029 header-comment + `--> statement-breakpoint` style. Journal idx-30 entry appended matching sibling shape. Recorded in `drizzle.__drizzle_migrations` (auto-id 31, created_at = journal `when`).
- **categories-schema.ts**: removed the `reserveActualCents` bigint column block (and the now-unused `bigint` import); `reserveExcluded`, `archivedAt`, `archivedFrom`, `sortIndex` left intact.
- **ReserveEventLoaderRepo port** (`src/ports/reserve-event-loader-repo.ts`, 72 lines, zero infra imports): `ReserveEventInputs` (spendByCategoryByMonth, limitsByMonth, cushionHistory, adjustmentsByCategory, categoryFlags, userDefinedCents, reservesEnabled, openMonth, budgetCurrency) + `ReserveEventLoaderRepo.load(tenantId, budgetId, openMonthOverride?)`.
- **Drizzle adapter** (`src/adapters/persistence/reserve-event-loader-repo.ts`, ~265 lines): composes existing ports (`transactionRepo.spendByCategoryByMonth`, `categoryLimitRepo.effectiveForMonth`, `reservesSummaryRepo.sumReserveWalletAmounts`) injected via factory-style deps; in-adapter raw SQL only for budget meta (tz/currency/reserves_enabled), `budget_mode_history` (cushion history ASC), `category_reserve_adjustments` (deltas ASC), and `categories` (flags). Open-month resolved TZ-correct via `Temporal.PlainYearMonth` (mirrors `getReservePositions`). All identifiers bound as `${value}::uuid` params inside `withTenantTx` (RLS); adjustment + categories SELECTs carry an explicit `tenant_id =` predicate (defence in depth).
- **Integration test** (`test/adapters/reserve-event-loader-repo.test.ts`): bun:test, real Postgres (no mocks). Seeds budget + 2 categories + SCD-2 limits + 1 adjustment + 1 RESERVE wallet + 2 months of confirmed SPENDING. 10 tests, ≥1 assertion per `ReserveEventInputs` field, asserts adjustment + cushion ordering ascending and cross-tenant RLS scoping.

## Migrate command + result

Command (rebuilt the prebuilt migrator image first — required per CLAUDE.md "prebuilt images don't hot-reload"; the first `make migrate` against the stale image reported "complete" without applying 0030):

```
infisical run --env=dev -- docker compose build migrator
make migrate
```

Result: `[migrator] complete` (exit 0). Live DB verified:

- `budgeting.categories.reserve_actual_cents` — GONE (col count 0)
- `budgeting.category_reserve_balance` VIEW — GONE (view count 0)
- migration 0030 recorded in `drizzle.__drizzle_migrations` (created_at 1780652507000)
- KEPT (verified present): `category_reserve_adjustments`, `budget_mode_history`, `tenancy.budgets.reserves_enabled`, categories `archived_at`/`archived_from`/`reserve_excluded`.

## Test results

`infisical run --env=dev -- bun test packages/budgeting/test/adapters/reserve-event-loader-repo.test.ts`
→ **10 pass / 0 fail** (10 tests, ~1.0s) against real Postgres.

(The runner process exit code is 1 because the package-wide 80% coverage gate in `bunfig.toml` fires when a single file is run in isolation — NOT a test failure. All tests pass.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed orphaned GRANT on the dropped VIEW in post-migration.sql**

- **Found during:** Task 1 ([BLOCKING] migrate)
- **Issue:** `apps/migrator/post-migration.sql:703` did `GRANT SELECT ON budgeting.category_reserve_balance TO app_role, worker_role;`. `post-migration.sql` runs on every migrate; after migration 0030 dropped the VIEW, this grant errored with `42P01` (undefined view) and aborted the post-migration transaction, failing the whole migrate.
- **Fix:** Removed the stale GRANT line (the VIEW is intentionally gone per decision B). Rebuilt the migrator image; migrate then completed cleanly. Migration 0030's DROPs had already committed (drizzle commits each migration transactionally before post-migration runs), so the re-run only re-applied the fixed post-migration.sql.
- **Files modified:** apps/migrator/post-migration.sql
- **Commit:** 123aabc

**2. [Rule 1 - Bug] Read-only GUC actor must be a valid UUID**

- **Found during:** Task 2 (loader test, RED)
- **Issue:** The adapter passed `UserId("system")` to `withTenantTx`. `withTenantTx` sets the `app.current_user_id` GUC to that value; the budget-meta SELECT against `tenancy.budgets` (whose RLS validates the user id) failed with `invalid input syntax for type uuid: "system"`. All 10 tests failed at the meta query.
- **Fix:** Replaced both `UserId("system")` occurrences with `UserId(tenantId)` (a valid UUID, the established read-only placeholder pattern used by `reserves-summary-repo.ts` and `effectiveForMonth`). Tests then 10/10 green.
- **Files modified:** packages/budgeting/src/adapters/persistence/reserve-event-loader-repo.ts
- **Commit:** 2ea0b70

**3. [Rule 3 - Blocking] Fixture column-name corrections (test-only)**

- **Found during:** Task 2 (loader test seed)
- **Issue:** Initial fixture INSERT used `actor_user_id` on `category_reserve_adjustments`; the real column is `created_by` (nullable). `42703` undefined column.
- **Fix:** Used `created_by` in the adjustment INSERT (verified the live column list first).
- **Files modified:** packages/budgeting/test/adapters/reserve-event-loader-repo.test.ts
- **Commit:** 2ea0b70

### Note: rebuilding the prebuilt migrator image

Not a deviation per se, but load-bearing: `apps/migrator/Dockerfile` bakes `COPY drizzle ./drizzle` at build time and runs drizzle-orm's `migrate()`. The running migrator container used a stale image without the new 0030 file, so the first `make migrate` reported "complete" while applying nothing. Rebuilding the migrator image (`docker compose build migrator`) before `make migrate` was required — consistent with CLAUDE.md's rule that api/web/worker (and the migrator) run from prebuilt images that do not hot-reload.

## Deferred breakage for later waves (05-13 / 05-16)

Per the plan's explicit mid-refactor note, dropping the column/VIEW leaves code that still references the old surface. This is INTENTIONAL and out of scope for this plan; later waves remove it:

- `src/` files still wiring the old VIEW-based repo: `reserve-balance-repo.ts` (queries the now-gone `category_reserve_balance` VIEW), `contracts/factory.ts` (`createReserveBalanceRepo` wired into reservePositions / archiveWallet / setWalletBalance / recomputeReserveTopup), `application/get-reserve-positions.ts`, `get-reserves-summary.ts`, `get-spendings-summary.ts`, `recompute-reserve-topup-task.ts`, `reserves-summary-builder.ts`, `archive-category.ts`, `archive-wallet.ts`, `adjust-category-reserve.ts`, `set-wallet-balance.ts`, `update-wallet.ts`, `toggle-category-reserve-excluded.ts`, `budget-home-summary-repo.ts`, `categories-repo.ts`, `ports/reserve-balance-repo.ts`, `ports/categories-repo.ts`, and `apps/api/src/boot.ts`. These compile (tsc accepts the runtime SQL/grants) but the VIEW-querying reads now fail at query time — replaced by the event-loader path in 05-12 and the dead repo removed in 05-13/05-16.

### Deferred Issues (pre-existing, NOT caused by this plan — out of scope)

`tsc -p packages/budgeting/tsconfig.json` reports **26 errors, all in test files** and all pre-existing/unrelated to this plan's changes (none in `src/`, none in the new files):

- `test/application/reserves-use-cases.test.ts` + `get-budget-home-summary.test.ts`: mock `ReserveBalanceRepo` missing `getDiscardedForBudget` (added in 0029); stale overloads.
- `test/budget-template-apply.test.ts`, `test/category-domain.test.ts`, `test/share-overrides-sum-trigger.test.ts`: `Result.value`/`.error` API drift.
- `test/frankfurter-adapter.test.ts`: `fetch.preconnect` missing on the test stub.
- `test/tasks/reserve-topup.test.ts`: `Cannot find module '@budget/worker/src/handlers/budgeting-reconciliation'`.
  Logged, not fixed (SCOPE BOUNDARY: pre-existing failures in unrelated files).

## Known Stubs

None — the loader returns real data from real tables; no placeholder/empty-value stubs introduced.

## Self-Check: PASSED

- drizzle/0030_phase05_reserve_model_reset.sql — FOUND
- packages/budgeting/src/ports/reserve-event-loader-repo.ts — FOUND
- packages/budgeting/src/adapters/persistence/reserve-event-loader-repo.ts — FOUND
- packages/budgeting/test/adapters/reserve-event-loader-repo.test.ts — FOUND
- Commit 492930e (T0 migration) — FOUND
- Commit 123aabc (T1 post-migration fix) — FOUND
- Commit 2ea0b70 (T2 port+adapter+test) — FOUND
- Live DB: reserve_actual_cents col GONE, category_reserve_balance VIEW GONE — VERIFIED
- Loader integration test: 10 pass / 0 fail on real Postgres — VERIFIED
