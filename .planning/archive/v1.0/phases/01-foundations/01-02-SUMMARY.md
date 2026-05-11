---
phase: 01-foundations
plan: 02
plan_id: 01.02
subsystem: platform
tags: [database, rls, postgres, drizzle, migration, testcontainer, tx-primitives]
dependency_graph:
  requires: [01.00, 01.01]
  provides: [platform-tx-primitives, testcontainer-bootstrap, migrator-runner, expense-ledger-schema]
  affects: [01.03, 01.04, 01.05, 01.06, 01.07, 01.10]
tech_stack:
  added:
    - drizzle-orm@0.45.2 (Drizzle ORM + pg-core)
    - drizzle-kit@0.31.10 (migration generation)
    - pg@8.13.0 (node-postgres client)
    - "@types/pg@8.11.0"
  patterns:
    - Five named transaction primitives as the only writable DB access layer
    - sql.raw() for SET LOCAL GUC statements (Postgres forbids parameterized SET LOCAL)
    - Singleton pool factories with resetPools() for test isolation
    - Bun.spawn(docker run) for test containers (replaces @testcontainers/postgresql)
key_files:
  created:
    - packages/platform/src/db/pool.ts
    - packages/platform/src/db/numeric-parser.ts
    - packages/platform/src/db/rls.ts
    - packages/platform/src/db/tx.ts
    - packages/platform/src/db/schemas.ts
    - packages/platform/src/db/roles.ts
    - packages/platform/src/db/expense-ledger.ts
    - packages/db/test/testcontainer.ts
    - packages/db/test/index.ts
    - apps/migrator/src/migrate.ts
    - apps/migrator/drizzle.config.ts
    - apps/migrator/Dockerfile
    - apps/migrator/post-migration.sql
    - apps/migrator/tsconfig.json
    - drizzle/0000_giant_shotgun.sql
  modified:
    - packages/platform/src/index.ts (barrel export)
    - packages/platform/package.json (dependencies)
    - packages/db/package.json (dependencies)
    - apps/migrator/package.json (dependencies + scripts)
    - package.json (root devDeps: @budget/db, pg, @types/pg for tests/ dir)
    - bunfig.toml (timeout=30000 for integration tests)
decisions:
  - "rls.ts uses sql.raw() for SET LOCAL — Postgres rejects $1 parameters in SET LOCAL (42601 syntax error); UUID values are safe to inline as they are validated at the branded-type boundary"
  - "pool.ts reads DATABASE_URL_* directly (not via loadEnv()) so test pools can be created without BUDGET_KEK/BETTER_AUTH_SECRET present"
  - "testcontainer.ts uses Bun.spawn(docker run) instead of @testcontainers/postgresql v10 — testcontainers library hangs on Bun due to event-loop incompatibility (library's async patterns prevent Bun from detecting pending work, causing premature process exit)"
  - "post-migration.sql applied via admin (postgres) pool, not migrator pool — ALTER ROLE requires superuser; migrator role has NOSUPERUSER"
  - "PC-05 resolved: expense_ledger ships in budgeting schema in Phase 1; full Budgeting context (categories, limits, periods) deferred to Phase 2"
metrics:
  duration_minutes: 38
  tasks_completed: 5
  files_created: 15
  files_modified: 6
  tests_passing: 14
  completed_date: "2026-05-06"
---

# Phase 1 Plan 02: DB RLS Skeleton Summary

**One-liner:** Postgres connection layer with five named transaction primitives (withTenantTx, withTenantTxRead, withUserContext, withInfraTx, withBootstrapUserContext), NOBYPASSRLS role separation, expense_ledger append-only primitive, pg_advisory_lock migrator, and a Bun-native Docker-based testcontainer for Wave-1/2 integration tests.

## What Was Built

### Task 1: Pool + numeric-parser (2a4f464)

- `appPool()`, `workerPool()`, `migratorPool()` — singleton-per-role Pool factories reading `DATABASE_URL_*` directly from `process.env`
- `configureNumericParsers()` — OID 20 (BIGINT) → `bigint`, OID 1700 (NUMERIC) kept as string
- `appDb()` / `workerDb()` — Drizzle instances with `casing: 'snake_case'`

### Task 2: FIVE tx primitives (b69b834)

- `withTenantTx(tenantId, userId, fn)` — single-tenant write, sets both GUCs
- `withTenantTxRead(tenantIds, userId, fn)` — multi-tenant read, rejects empty array
- `withUserContext(userId, fn)` — user-scoped tables only (no tenant GUC)
- `withInfraTx(fn)` — infrastructure carve-out (no GUCs), uses workerDb
- `withBootstrapUserContext(userId, fn)` — PC-27 tenant-guard bootstrap
- `rls.ts`: `tenantContextSql` / `userContextSql` using `sql.raw()` (Postgres forbids `$1` in SET LOCAL)

### Task 3: pgSchemas, pgRoles, expense_ledger (352906b)

- 5 pgSchema declarations: identity, tenancy, shared_kernel, comparison, budgeting
- 3 pgRole declarations: app_role, worker_role, migrator (all `createRole: false`)
- `expenseLedger` table with MONY-06 columns + `pgPolicy(expense_ledger_tenant_isolation)`
- `post-migration.sql`: ALTER ROLE NOBYPASSRLS, REVOKE UPDATE/DELETE, FORCE RLS, schema grants

### Task 4: Migrator runner (ae3bacf)

- `apps/migrator/src/migrate.ts`: `pg_advisory_lock(hashtext('budget-migrations'))` → drizzle migrate → post-migration.sql
- `drizzle.config.ts` + `Dockerfile` + `tsconfig.json`
- Generated migration: `drizzle/0000_giant_shotgun.sql`

### Task 5: Testcontainer bootstrap (1987c09)

- `packages/db/test/testcontainer.ts`: `startTestcontainer()` starts Postgres 17-alpine via `docker run`, creates 3 NOBYPASSRLS roles + 5 schemas, runs drizzle migrations, applies post-migration.sql
- Sets `DATABASE_URL_APP/WORKER/MIGRATOR` env vars + calls `resetPools()`
- 14 tests pass across 6 files in ~3.9s (container reused within a test process)

## Test Results

| Test File                                                  | Tests | Status |
| ---------------------------------------------------------- | ----- | ------ |
| packages/platform/test/numeric-parser.test.ts              | 2     | PASS   |
| packages/platform/test/tx.test.ts                          | 5     | PASS   |
| packages/platform/test/with-user-context.test.ts           | 1     | PASS   |
| packages/platform/test/with-bootstrap-user-context.test.ts | 1     | PASS   |
| packages/platform/test/ledger-revoke.test.ts               | 3     | PASS   |
| tests/migrator-role.test.ts                                | 2     | PASS   |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `SET LOCAL` with Drizzle parameterized query fails (Postgres 42601)**

- **Found during:** Task 2 integration testing
- **Issue:** `sql\`SET LOCAL app.tenant_ids = ${literal}\``generates`SET LOCAL app.tenant_ids = $1` — Postgres rejects parameterized queries in SET LOCAL with syntax error 42601
- **Fix:** Changed `rls.ts` to use `sql.raw()` with inlined UUID strings; UUID values are safe to inline (validated at branded-type boundary, no SQL injection risk)
- **Files modified:** `packages/platform/src/db/rls.ts`
- **Commit:** b69b834

**2. [Rule 1 - Bug] `loadEnv()` strict validation breaks pool creation in test contexts**

- **Found during:** Task 1 implementation (anticipatory)
- **Issue:** `loadEnv()` requires BUDGET*KEK, BETTER_AUTH_SECRET, etc. which are not set when testcontainer only provides DATABASE_URL*\* vars
- **Fix:** `pool.ts` reads `DATABASE_URL_*` directly from `process.env` with a simple `requireEnv()` guard; added `resetPools()` for test re-initialization
- **Files modified:** `packages/platform/src/db/pool.ts`
- **Commit:** b69b834

**3. [Rule 3 - Blocking] `@testcontainers/postgresql` v10 incompatible with Bun runtime**

- **Found during:** Task 5 implementation
- **Issue:** `new PostgreSqlContainer().start()` hangs indefinitely on Bun 1.3.12 — testcontainers uses Node.js-specific async patterns that prevent Bun from detecting pending work, causing the Bun event loop to exit prematurely (process exits with code 0 before start() resolves)
- **Fix:** Replaced `@testcontainers/postgresql` library with `Bun.spawn(["docker", "run", ...])` using `docker run --health-cmd pg_isready` for readiness polling. Same contract, Bun-native implementation.
- **Files modified:** `packages/db/test/testcontainer.ts`, `packages/db/package.json`
- **Commit:** 1987c09

**4. [Rule 1 - Bug] post-migration.sql `ALTER ROLE` requires superuser (not migrator role)**

- **Found during:** Task 5 testcontainer debugging
- **Issue:** `ALTER ROLE app_role NOBYPASSRLS` requires superuser; the migrator role has `NOSUPERUSER`
- **Fix:** testcontainer applies post-migration.sql via the admin postgres pool (superuser), not the migrator pool. This matches production intent — infra tooling (not the app migrator) manages role attributes.
- **Files modified:** `packages/db/test/testcontainer.ts`
- **Commit:** 1987c09

## Threat Surface Scan

No new network endpoints or auth paths introduced. All DB access routes through the five named transaction primitives. The `sql.raw()` usage in rls.ts is bounded to UUID values validated at the branded-type boundary — no unvalidated user input reaches those calls.

## Known Stubs

None — all implementations are functional. The expense_ledger table is empty (no INSERTs yet), populated in Phase 2 by the Budgeting context as designed.

## Self-Check: PASSED

All key files present. All commits verified in git history. 14 tests pass across 6 files.
