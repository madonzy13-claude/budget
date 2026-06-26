---
phase: 09-investments-wallet
plan: 04
subsystem: infra
tags: [pg-boss, worker, jobs, task-repo, rls, idempotency, tdd, fx, snapshot]

# Dependency graph
requires:
  - phase: 09-investments-wallet
    provides: "09-01 tables + 0038 dedup index; 09-03 PriceProvider/composite + InstrumentRepo"
provides:
  - "TaskRepo.emitInvestmentDelisted (port + adapter, idempotent via 0038 index)"
  - "INVESTMENT_INSTRUMENT_DELISTED TaskKind + InvestmentDelistedPayload"
  - "3 pg-boss jobs: instrument-price-hourly, instruments-daily-seed, investment-snapshot-daily"
  - "investments_worker_cron_scan RLS policy (cross-tenant cron reads)"
affects: [09-06, 09-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reference-data cron job = withInfraTx + investments_worker_cron_scan (SELECT-only cross-tenant); writes via withTenantTx"
    - "Idempotent emit = bare ON CONFLICT DO NOTHING (not explicit expression-index target — trips PG's inference matcher)"
    - 'drizzle scalar-binds JS arrays → build PG array literals ({"x"}) and bind as text ::text[]'

key-files:
  created:
    - apps/worker/src/handlers/instrument-price-hourly.ts
    - apps/worker/src/handlers/instruments-daily-seed.ts
    - apps/worker/src/handlers/investment-snapshot-daily.ts
    - apps/worker/test/instrument-price-hourly.test.ts
    - apps/worker/test/instruments-daily-seed.test.ts
    - apps/worker/test/investment-snapshot-daily.test.ts
    - apps/worker/test/_investment-fixtures.ts
  modified:
    - packages/budgeting/src/ports/task-repo.ts
    - packages/budgeting/src/adapters/persistence/task-repo.ts
    - packages/budgeting/test/application/list-pending-tasks.test.ts
    - apps/worker/src/worker.ts
    - apps/worker/package.json
    - packages/investments/package.json
    - apps/migrator/post-migration.sql

key-decisions:
  - "emitInvestmentDelisted uses bare ON CONFLICT DO NOTHING (the plan's explicit ((payload_json->>'holding_id')) WHERE ... target raised 'no unique constraint matching' — PG won't infer an expression partial index reliably; bare DO NOTHING still catches it, like emitConfirmDraft)"
  - "Added investments_worker_cron_scan (FOR SELECT TO worker_role USING true) — 09-01 omitted it; the cron held-set reads return 0 rows under FORCE RLS without it"
  - "Daily seed deactivation is scoped per-provider (only the refreshed providers' absent symbols) so an unrelated provider's universe is untouched; the static DEFAULT_INVESTMENT_UNIVERSE is the authoritative searchable set"
  - "Worker reads price-provider API keys from env (composition root) and injects them; adapters never read env"
  - "instrument-price-hourly passes context:'hourly' so metals (excluded by refresh_cadence anyway) would also self-guard"

patterns-established:
  - "New cross-package import needs the importer to declare the workspace dep (bun only symlinks depended-on workspaces) + subpath exports in the dependency's package.json"

requirements-completed: [INV-13, INV-15]

# Metrics
duration: 60min
completed: 2026-06-21
---

# Phase 9 Plan 04: Investment Jobs + Delisted Emit Summary

**TaskRepo.emitInvestmentDelisted (idempotent via the 0038 dedup index) + three pg-boss jobs — hourly held-only price refresh, daily instruments seed/delisting, daily price+FX snapshot — registered in worker.ts. TDD, 3 job tests green on real Postgres.**

## Performance

- **Duration:** ~60 min (integration-heavy: RLS, dual-pool fixture, array binding, ON CONFLICT)
- **Tasks:** TDD feature (RED → GREEN; REFACTOR skipped — held-set queries differ)
- **Files:** 7 created, 7 modified
- **Tests:** 3 job tests pass / 0 fail (standalone). Full monorepo typecheck clean.

## Accomplishments

- `TaskRepo.emitInvestmentDelisted` (port + adapter): bare `ON CONFLICT DO NOTHING` against `tasks_investment_delisted_dedup_idx` (0038) — re-running the daily seed never creates a second OPEN task per holding (proven: COUNT stays 1 across two runs).
- `instrument-price-hourly`: distinct held tracked instruments across all tenants in one query; excludes custom (instrument_id NULL) + daily metals; `{fetched, failed}`; one bad symbol doesn't abort (T-9-10).
- `instruments-daily-seed`: upsert universe → per-provider deactivate-absent → emit one delisted task per affected held holding (unheld inactive emits nothing).
- `investment-snapshot-daily`: one snapshot/instrument/day (ON CONFLICT DO NOTHING) + held buy/current currencies vs EUR → fxProvider.rateAsOf (extends the daily FX pairs, D-30).
- `investments_worker_cron_scan` RLS policy added so the cron held-set reads work cross-tenant.

## Task Commits

1. **RED: failing job tests + fixture + enabling infra** — `8cb493f` (test)
2. **GREEN: emit + 3 jobs + worker wiring** — `107d8aa` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] investments_worker_cron_scan RLS policy**

- 09-01 added investments_tenant_isolation but no worker cron-scan policy. The 3 jobs read investments cross-tenant via withInfraTx (worker_role, no GUC) → FORCE RLS returns 0 rows. Added `FOR SELECT TO worker_role USING (true)` (mirrors wallets_worker_cron_scan) to post-migration.sql; rebuilt migrator + re-applied. Committed in `8cb493f`.

**2. [Rule 1 - Bug] emit ON CONFLICT inference + array binding + RLS-count**

- Explicit expression-index ON CONFLICT target raised "no unique constraint matching" → switched to bare `ON CONFLICT DO NOTHING` (proven analog). drizzle scalar-binds JS arrays ("x" not "{x}") → built PG array literals for the deactivate ANY/ALL. The test's delisted COUNT ran via the no-GUC worker pool → RLS hid the row → set the tenant GUC in the count helper. Committed in `107d8aa`.

**3. [Rule 3 - Blocking] cross-package resolution**

- `@budget/investments/...` didn't resolve (bun only symlinks depended-on workspaces). Added `@budget/investments` to apps/worker deps + ports/adapters subpaths to investments `exports`. Committed in `8cb493f`.

**4. [Rule 1 - Bug] shared-pool teardown across test files**

- bun shares the fixture module across the 3 files → the first file's endPools() killed the others' pools. Removed per-file endPools (bun exits the process at suite end). Committed in `107d8aa`.

---

**Total deviations:** 4 auto-fixed. **Impact:** all essential to make the jobs run + verify under RLS. No scope creep.

## Issues Encountered

- `bun test apps/worker/test/` (full dir) exits 1: a PRE-EXISTING flaky `budgeting-reconciliation` integration test (env-sensitive, ~11s) + a bun multi-file module-eval-order artifact ("withInfraTx not found / resetPools not a function" surfacing only when many platform-importing files batch). Platform exports are verified working (the diagnostics + worker boot use them); the 3 job tests pass standalone. Consistent with documented "make test infra debt — verify with correct runners".

## User Setup Required

Price provider API keys (see 09-01/09-03 user-setup) — the worker reads TWELVE_DATA_API_KEY / COINGECKO_API_KEY / METALS_DEV_API_KEY from env. Without them the hourly/seed live fetches no-op-fail (failed count rises); the jobs still run and the snapshot/delisting logic works.

## Next Phase Readiness

- 09-06 routes reuse TaskRepo + the on-add fetch; the delisted task surfaces in the Tasks queue.
- 09-07 renders the delisted task row + the Investments section.
- NOTE: full dynamic universe ingestion (paginated Twelve Data /stocks, CoinGecko top-N) is a follow-up — the seed currently uses a curated static universe (the authoritative searchable set).

---

_Phase: 09-investments-wallet_
_Completed: 2026-06-21_
