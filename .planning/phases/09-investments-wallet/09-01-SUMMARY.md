---
phase: 09-investments-wallet
plan: 01
subsystem: database
tags:
  [drizzle, postgres, rls, pg_trgm, migration, investments, bigint, rate-limit]

# Dependency graph
requires:
  - phase: 05-reserves-wallets-tabs
    provides: wallets-schema RLS pattern, budgeting schema, app_role/worker_role grants
  - phase: 07-tasks-queue
    provides: tasks table + tasks_kind_chk + dedup-index pattern (migration 0026)
provides:
  - "@budget/investments package skeleton (resolvable workspace, typecheck-green)"
  - "4 Drizzle schemas: investments (tenant-scoped, RLS), instruments + price-cache + price-snapshot (reference, no RLS)"
  - "tenancy.budgets.investments_enabled flag (default false)"
  - "tasks_kind_chk extended with INVESTMENT_INSTRUMENT_DELISTED"
  - "tasks_investment_delisted_dedup_idx (T-9-11 idempotency)"
  - "budgeting.api_rate_limits throttle table (T-9-16 / INV-14)"
  - "Migration 0038 APPLIED to live dev DB (pg_trgm + all objects physically exist)"
affects: [09-02, 09-03, 09-04, 09-06, 09-07]

# Tech tracking
tech-stack:
  added: ["@budget/investments package", "pg_trgm extension"]
  patterns:
    - "bigint mode:bigint for *_cents money columns; numeric(28,8) for quantity/price"
    - "tenant table = pgPolicy RLS in schema + ENABLE RLS/policy in migration + FORCE RLS in post-migration"
    - "reference table = no RLS, grants in post-migration.sql"
    - "hand-authored migration + manual _journal.json entry (drizzle-kit BigInt bug)"

key-files:
  created:
    - packages/investments/package.json
    - packages/investments/tsconfig.json
    - packages/investments/src/index.ts
    - packages/investments/src/adapters/persistence/investments-schema.ts
    - packages/investments/src/adapters/persistence/instruments-schema.ts
    - packages/investments/src/adapters/persistence/price-cache-schema.ts
    - packages/investments/src/adapters/persistence/price-snapshot-schema.ts
    - drizzle/0038_phase09_investments.sql
  modified:
    - packages/tenancy/src/adapters/persistence/schema.ts
    - packages/budgeting/src/adapters/persistence/tasks-schema.ts
    - drizzle/meta/_journal.json
    - apps/migrator/post-migration.sql

key-decisions:
  - "investments_enabled defaults FALSE (opt-in) — unlike reserves/cushion which default true"
  - "Money stored as bigint cents (buy_price_cents, current_price_cents); quantity numeric(28,8)"
  - "buy/current price + currency columns nullable to support custom/cash holdings; quantity NOT NULL"
  - "api_rate_limits is migration-only (no Drizzle schema file) — consumed via raw SQL upsert in 09-06"
  - "Migration owns the RLS ENABLE + policy; post-migration owns FORCE RLS + table/role GRANTs"

patterns-established:
  - "Investments persistence split: 1 tenant-scoped holdings table + 3 shared reference tables"
  - "Delisted-task dedup via partial unique index on (payload_json->>'holding_id') WHERE kind+status=PENDING"

requirements-completed: [INV-01, INV-03, INV-04]

# Metrics
duration: 12min
completed: 2026-06-21
---

# Phase 9 Plan 01: Investments Schema Foundation Summary

**@budget/investments package + 4 Drizzle schemas + hand-authored migration 0038 (pg_trgm, RLS holdings table, 3 reference tables, delisted dedup index, api_rate_limits) applied to the live dev DB.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-21T08:47:40Z
- **Completed:** 2026-06-21T08:59:56Z
- **Tasks:** 4
- **Files modified:** 12 (8 created, 4 modified)

## Accomplishments

- New `@budget/investments` workspace resolves and typechecks green across all 12 packages.
- 4 persistence schemas with the correct RLS / no-RLS split (holdings isolated; instruments/cache/snapshot are shared reference data).
- `tenancy.budgets.investments_enabled` (default false) gates the wallets-page Investments section.
- Single phase-9 migration also carries the `INVESTMENT_INSTRUMENT_DELISTED` task kind + its dedup index (T-9-11) and the `api_rate_limits` throttle table (T-9-16) — no 0039 downstream.
- Migration **applied to the live DB** and verified: all 4 tables + api_rate_limits + the delisted index exist; investments has RLS+FORCE; reference tables have grants not RLS; tasks CHECK accepts the 4th kind; pg_trgm enabled.

## Task Commits

1. **Task 1: Scaffold package + 4 Drizzle schema files** — `47b2fe0` (feat)
2. **Task 2: investments_enabled flag + INVESTMENT_INSTRUMENT_DELISTED kind** — `5d7717f` (feat)
3. **Task 3: Hand-author migration 0038 + grants + journal entry** — `8d5d75c` (feat)
4. **Task 4 [BLOCKING]: Apply migration 0038 to live dev DB** — runtime apply (no code commit; verified via `to_regclass` + RLS/grant probes)

## Files Created/Modified

- `packages/investments/*` — new bounded-context package (package.json, tsconfig, barrel, 4 schemas)
- `packages/tenancy/.../schema.ts` — `investmentsEnabled` boolean column
- `packages/budgeting/.../tasks-schema.ts` — extended `tasks_kind_chk`
- `drizzle/0038_phase09_investments.sql` — the single phase-9 migration
- `drizzle/meta/_journal.json` — idx 38 entry
- `apps/migrator/post-migration.sql` — GRANTs + FORCE RLS for the new tables

## Decisions Made

- See key-decisions frontmatter. Notable: investments_enabled is opt-in (default false); price/buy columns nullable for cash/custom holdings; RLS policy in migration, FORCE+grants in post-migration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt the migrator Docker image before the migration would apply**

- **Found during:** Task 4 (apply migration)
- **Issue:** First `make migrate` exited 0 and logged "complete" but applied nothing — the migrator runs from a prebuilt image that bakes `COPY drizzle ./drizzle` + `COPY apps/migrator` at build time (no volume mounts), so the host's new 0038/journal/post-migration were invisible. `to_regclass` returned NULL for every new object.
- **Fix:** `docker compose build migrator` (COPY layer invalidated on the new files), then re-ran `make migrate`.
- **Files modified:** none (build/runtime only)
- **Verification:** Re-ran `to_regclass` probes — all 6 objects non-null; investments rls+force = t/t; tasks CHECK has 4 kinds; pg_trgm present.
- **Committed in:** n/a (no code change)

**2. [Rule 2 - Missing Critical] Added a table GRANT for budgeting.investments in post-migration.sql**

- **Found during:** Task 3 (post-migration grants)
- **Issue:** The plan listed grants for the 3 reference tables + api_rate_limits and FORCE RLS for investments, but no table-level GRANT on investments itself. RLS sits on top of grants — without `GRANT ... ON budgeting.investments TO app_role`, the P06 API path (app_role) cannot read/write holdings at all.
- **Fix:** Added `GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.investments TO app_role, worker_role;` (mirrors wallets/tasks).
- **Files modified:** apps/migrator/post-migration.sql
- **Verification:** `has_table_privilege('app_role','budgeting.investments','SELECT')` = t.
- **Committed in:** `8d5d75c` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical)
**Impact on plan:** Both essential — the rebuild made the BLOCKING migrate actually apply; the GRANT makes the holdings table reachable by the API. No scope creep.

## Issues Encountered

- Stale prebuilt migrator image (see Deviation 1) — resolved by rebuild. This is the project-wide "Docker images are prebuilt; rebuild before verifying" rule applied to the migrator service.

## User Setup Required

**External services require manual configuration** (price providers, consumed by 09-03 adapters / 09-04 jobs):

- `TWELVE_DATA_API_KEY` (twelvedata.com, free 800/day) — equities/ETF/FX
- `COINGECKO_API_KEY` (coingecko.com/api, Demo plan, header `x-cg-demo-api-key`) — crypto
- `METALS_DEV_API_KEY` (metals.dev, free 100/month, daily-only refresh) — gold/silver

Add to Infisical dev + prod. Not required for this plan's verification, but blocks 09-03/09-04 live price fetches.

## Next Phase Readiness

- Drizzle types are live for 09-03 repos (HoldingRepo, InstrumentRepo, PriceCacheRepo) and 09-06 routes.
- `tasks_investment_delisted_dedup_idx` is the ON CONFLICT target for the 09-04 delisted emit.
- `api_rate_limits` is ready for the 09-06 on-add fetch upsert.
- Ready for 09-02 (domain core: Holding + portfolio-metrics) and 09-05 (test scaffolding).

---

_Phase: 09-investments-wallet_
_Completed: 2026-06-21_
