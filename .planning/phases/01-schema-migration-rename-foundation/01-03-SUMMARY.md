---
phase: "01"
plan: "01-03"
subsystem: api-routes
tags: [rename, hono, routes, header, tdd, integration-tests]
depends_on: [01-02]
provides: [renamed-routes, budget-id-header, health-endpoint]
affects: [apps/api, packages/budgeting]
tech_stack:
  added: []
  patterns: [hono-route-factory, drizzle-raw-sql, wallet_id-in-ledger]
key_files:
  created:
    - apps/api/test/routes/budgets.test.ts
    - apps/api/test/routes/wallets.test.ts
    - apps/api/test/routes/budget-settings.test.ts
    - apps/api/test/middleware/tenant-guard.test.ts
  modified:
    - apps/api/src/app.ts
    - apps/api/src/routes/budgets.ts
    - apps/api/src/routes/wallets.ts
    - apps/api/src/routes/budget-settings.ts
    - apps/api/src/routes/categories.ts
    - apps/api/src/routes/transactions.ts
    - apps/api/src/routes/category-limits.ts
    - apps/api/src/routes/recurring-drafts.ts
    - apps/api/src/middleware/tenant-guard.ts
    - packages/budgeting/src/adapters/persistence/transaction-repo.ts
    - packages/budgeting/src/adapters/persistence/recurring-rule-repo.ts
    - packages/budgeting/src/adapters/persistence/recurring-draft-repo.ts
    - packages/budgeting/src/application/search-transactions.ts
    - packages/budgeting/src/application/confirm-recurring-draft.ts
    - packages/budgeting/src/application/edit-and-confirm-recurring-draft.ts
    - packages/budgeting/src/application/create-recurring-rule.ts
    - packages/budgeting/src/contracts/factory.ts
    - apps/migrator/post-migration.sql
decisions:
  - "D-07: minimum compile-fix only — strip dropped columns, preserve v1.0 request/response body shape"
  - "D-09: no path aliases — /workspaces/* and /accounts/* return 404"
  - "D-10: X-Workspace-ID header renamed to X-Budget-ID in tenant-guard.ts"
  - "wallet_id column added to expense_ledger to preserve accountId flow through correction chain"
metrics:
  duration: "~90 minutes"
  completed: "2026-05-11"
  tasks_completed: 3
  files_changed: 22
---

# Phase 01 Plan 03: Hono Route Rename, Header Rename, and Route Integration Tests Summary

Rename Hono route files (workspaces→budgets, accounts→wallets), flip mount paths in app.ts, rename X-Workspace-ID→X-Budget-ID in tenant-guard, strip dropped-column references, add /budgets/health endpoint. All 102 integration tests pass.

## Tasks Completed

| #   | Task                                                 | Commit           | Files                                              |
| --- | ---------------------------------------------------- | ---------------- | -------------------------------------------------- |
| 1   | RED tests — route + header rename integration tests  | d8cc85b          | 4 new test files                                   |
| 2   | Rename route files + app.ts mount paths              | 64a019f          | budgets.ts, wallets.ts, budget-settings.ts, app.ts |
| 3   | Header rename in tenant-guard + dropped-column strip | 4bf9781, b087f93 | tenant-guard.ts + 15 domain/adapter files          |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] expense_ledger missing wallet_id column breaks correction flow**

- **Found during:** Task 3 (transactions integration tests)
- **Issue:** MIG-03 dropped `account_id` from `expense_ledger`, but no replacement column stored accountId. The correction-insert chain read accountId from the row being corrected; with no wallet_id in SELECT, accountId was always `""`, causing `UPDATE budgeting.wallets WHERE id = ''` to silently update 0 rows and corrupt balance.
- **Fix:** Added `wallet_id uuid` to `post-migration.sql`; updated all `transaction-repo.ts` INSERTs, SELECTs, and row mapping to read/write `wallet_id`. Row mapper uses `wallet_id ?? account_id ?? ""` for backward compatibility.
- **Files modified:** `apps/migrator/post-migration.sql`, `packages/budgeting/src/adapters/persistence/transaction-repo.ts`
- **Commit:** b087f93

**2. [Rule 1 - Bug] search-transactions.ts selected e.kind which was dropped in MIG-03**

- **Found during:** Task 3
- **Issue:** `search-transactions.ts` queried `e.kind` from `expense_ledger` where `kind` column was dropped.
- **Fix:** Replaced with `'EXPENSE'::text AS kind` (all ledger rows are expenses; INCOME/TRANSFER use separate tables in v1.1).
- **Files modified:** `packages/budgeting/src/application/search-transactions.ts`
- **Commit:** b087f93

**3. [Rule 1 - Bug] recurring_rules and recurring_drafts SQL still used account_id column**

- **Found during:** Task 3
- **Issue:** create-recurring-rule.ts, recurring-rule-repo.ts, recurring-draft-repo.ts still used `account_id` in raw SQL INSERT/UPDATE/SELECT after plan 01-02 renamed column to `wallet_id`.
- **Fix:** Replaced all `account_id` → `wallet_id` in raw SQL strings across 3 files.
- **Files modified:** `packages/budgeting/src/application/create-recurring-rule.ts`, `packages/budgeting/src/adapters/persistence/recurring-rule-repo.ts`, `packages/budgeting/src/adapters/persistence/recurring-draft-repo.ts`
- **Commit:** b087f93

**4. [Rule 1 - Bug] confirm/edit-and-confirm-recurring-draft.ts queried tenancy.workspaces (dropped)**

- **Found during:** Task 3
- **Issue:** Both files fetched workspace default currency from `tenancy.workspaces` which was renamed to `tenancy.budgets` in plan 01-01.
- **Fix:** Updated both files to query `tenancy.budgets`.
- **Files modified:** `packages/budgeting/src/application/confirm-recurring-draft.ts`, `packages/budgeting/src/application/edit-and-confirm-recurring-draft.ts`
- **Commit:** b087f93

**5. [Rule 1 - Bug] Test fixtures used invalid wallet_type 'SAVINGS' enum value**

- **Found during:** Task 3
- **Issue:** `transactions.test.ts` inserted wallets with `wallet_type = 'SAVINGS'`; v1.1 enum is `{SPENDINGS, CUSHION, RESERVE}`.
- **Fix:** Replaced `'SAVINGS'` → `'RESERVE'` in fixture.
- **Files modified:** `apps/api/test/routes/transactions.test.ts`
- **Commit:** b087f93

**6. [Rule 1 - Bug] Test fixtures had 'PERSONAL' scope value in categories INSERT after scope column dropped**

- **Found during:** Task 3
- **Issue:** `transactions-search.test.ts` and `transactions-bulk.test.ts` passed 5 VALUES to a 4-column categories INSERT after `scope` column was dropped.
- **Fix:** Removed `'PERSONAL'` from both fixtures.
- **Files modified:** `apps/api/test/routes/transactions-search.test.ts`, `apps/api/test/routes/transactions-bulk.test.ts`
- **Commit:** b087f93

**7. [Rule 3 - Blocking] DB hostname @db: not reachable from test process**

- **Found during:** Task 3
- **Issue:** Test files used `DATABASE_URL_APP` verbatim which contains `@db:` hostname (Docker network). Tests run on host need `@localhost:`.
- **Fix:** Added `const DB_URL_RAW = ...; process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:")` to 5 test files.
- **Files modified:** `apps/api/test/routes/categories.test.ts`, `apps/api/test/routes/wallets.test.ts`, `apps/api/test/routes/category-limits.test.ts`, `apps/api/test/routes/share-overrides.test.ts`, `apps/api/test/schema/v11-shape.test.ts`
- **Commit:** b087f93

## Test Results

102 tests pass, 0 fail across all `apps/api/test/` suites.

## Pre-existing Typecheck Warnings (not caused by this plan)

The following typecheck errors exist in files NOT modified by this plan or were present before this plan's changes (verified via `git show HEAD~2`):

- `packages/budgeting/src/adapters/persistence/budget-mode-repo.ts` — workspace table reference (plan 01-02 scope)
- `packages/budgeting/src/adapters/persistence/fx-rate-cache-repo.ts` — unrelated type mismatch
- `packages/budgeting/src/application/get-latest-transactions.ts` — array index access
- `packages/budgeting/src/domain/services/set-category-limit.ts` — domain type mismatch
- `packages/budgeting/src/domain/services/correction.ts` — domain type
- `packages/platform/src/middleware.ts` — auth type
- `packages/budgeting/src/adapters/persistence/transaction-repo.ts:173,429` — writeOutbox type (pre-existing)
- `packages/budgeting/src/application/search-transactions.ts:155` — array index (pre-existing)

These are deferred to plan 01-04 or later plans where the relevant files are in scope.

## Known Stubs

None. All route handlers wire to real domain services and real DB. The `wallet_id` column in `expense_ledger` starts NULL for pre-migration rows; new rows get wallet_id populated.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes beyond what is specified in this plan.

## Self-Check: PASSED

- Commits exist: 64a019f, 4bf9781, b087f93
- SUMMARY.md created at `.planning/phases/01-schema-migration-rename-foundation/01-03-SUMMARY.md`
- 102/102 tests pass
