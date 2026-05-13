---
phase: 04-spendings-grid
plan: 02
subsystem: api
tags:
  [
    hono,
    drizzle,
    postgres,
    rls,
    scd2,
    recurring-drafts,
    spendings-grid,
    integration-tests,
  ]

# Dependency graph
requires:
  - phase: 04-01
    provides: "Schema spike confirming dismissed_at + timezone columns exist; Phase 4 UI scaffold"

provides:
  - "PUT /budgets/:budgetId/categories/sort-order — drag-reorder persistence (GRID-09)"
  - "GET /budgets/:budgetId/spendings-summary — 5-row header math with budgetTz (GRID-02, GRID-15, RSCM-03/04)"
  - "POST /budgets/:budgetId/recurring-rules/drafts/:id/dismiss — per-occurrence dismiss (RECR-06)"
  - "POST /budgets/:budgetId/recurring-rules/drafts/:id/confirm — per-occurrence confirm (RECR-03/04)"
  - "All 4 routes with tenant-leak protection (403 on budgetId != tenantId)"
  - "Integration tests: 22 tests across 5 files, all passing against real Postgres"
  - "Schema: dismissed_at column + GRANT UPDATE + timezone column properly applied via migrator"

affects:
  - "04-03 client-grid RSC — depends on spendings-summary DTO shape (budgetTz at top level)"
  - "04-04 optimistic mutations — depends on sort-order + dismiss/confirm routes"
  - "Future recurring draft flows — dismiss/confirm state machine enforced at DB layer"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Integration tests use app_role with explicit BEGIN + set_config('app.tenant_ids') + set_config('app.current_user_id') for RLS context in verification queries"
    - "seedDraft uses incrementing date offsets to avoid expense_ledger_recurring_rule_date_uidx unique constraint"
    - "post-migration.sql GRANT UPDATE list must include all columns that application writes update — migrator post-script overrides any inline GRANT"
    - "category-repo.ts reorder() requires ::integer cast on VALUES(uuid, idx) — drizzle sql-tagged params default to text"

key-files:
  created:
    - "apps/api/test/routes/categories-sort-order.test.ts"
    - "apps/api/test/routes/spendings-summary.test.ts"
    - "apps/api/test/routes/recurring-drafts-dismiss.test.ts"
    - "apps/api/test/routes/recurring-drafts-confirm.test.ts"
    - "drizzle/0019_phase04_budgets_timezone.sql"
  modified:
    - "apps/api/test/routes/category-limits.test.ts"
    - "packages/budgeting/package.json"
    - "packages/budgeting/src/adapters/persistence/category-repo.ts"
    - "apps/migrator/post-migration.sql"
    - "drizzle/meta/_journal.json"

key-decisions:
  - "budgetTz included at top level of SpendingsSummaryDTO so Plan 04-04 RSC skips a second /budgets/:id fetch (D-PH4-Q5)"
  - "0018_phase04_spendings_grid_schema.sql renamed to 0019 to resolve naming conflict with 0018_phase04_expense_ledger_dismissed_at.sql; both registered in _journal.json"
  - "Integration test DB verification uses set_config inside explicit BEGIN/COMMIT to set RLS context — app_role has NOBYPASSRLS, migrator role also has NOBYPASSRLS"
  - "dismissed_at added to post-migration.sql GRANT UPDATE column list — post-migration.sql revokes all UPDATE on expense_ledger then re-grants per-column; inline GRANTs in migration files are overwritten"

requirements-completed:
  - GRID-04
  - GRID-09
  - GRID-15
  - RECR-03
  - RECR-04
  - RECR-06
  - RSCM-03
  - RSCM-04

# Metrics
duration: 100min
completed: 2026-05-13
---

# Phase 04 Plan 02: Backend Routes + Integration Tests Summary

**4 new Hono routes (sort-order, spendings-summary, dismiss, confirm) with tenant-leak protection and 22 integration tests against real Postgres; schema push via migrator with dismissed_at GRANT fix in post-migration.sql**

## Performance

- **Duration:** ~100 min
- **Started:** 2026-05-13T17:45:00Z
- **Completed:** 2026-05-13T18:35:00Z
- **Tasks:** 4 (Task 1 completed in prior agent run; Tasks 2-4 completed here)
- **Files modified:** 11

## Accomplishments

- 22 integration tests across 5 files — all passing against real Postgres with RLS context
- Schema migration applied: both `expense_ledger.dismissed_at` and `tenancy.budgets.timezone` confirmed present; GRANT UPDATE on dismissed_at fixed in post-migration.sql (was missing, causing 500 errors)
- Auto-fixed 3 bugs discovered during test run (sort_index type cast, missing GRANT, missing package exports)
- ci-gate: 35 pass, 0 fail

## Task Commits

1. **Task 1: Application services + routes + ports + adapters** - `b8900e1` (feat) — completed prior agent
2. **Task 2: Integration tests** - `437fffc` + `6e5e228` (test + fix)
3. **Task 3: Schema push** - migrator applied; `dismissed_at` GRANT in `post-migration.sql` included in `437fffc`
4. **Task 4: Verification** - All tests pass; ci-gate clean

## Files Created/Modified

- `apps/api/test/routes/categories-sort-order.test.ts` — 4 tests: PUT sort-order golden + 422 + 403 tenant-leak
- `apps/api/test/routes/spendings-summary.test.ts` — 6 tests: empty, limits math, RSCM-04 overflow, 400 validation, 403 tenant-leak
- `apps/api/test/routes/recurring-drafts-dismiss.test.ts` — 4 tests: golden + 409 already_confirmed + 404 + 403 tenant-leak
- `apps/api/test/routes/recurring-drafts-confirm.test.ts` — 5 tests: golden + 409 × 2 + 404 + 403 tenant-leak
- `apps/api/test/routes/category-limits.test.ts` — extended with concurrent SCD-2 advisory lock test (Pitfall 3)
- `packages/budgeting/package.json` — added 9 new exports for Phase 4 application services + adapters
- `packages/budgeting/src/adapters/persistence/category-repo.ts` — fixed sort_index type cast in reorder()
- `apps/migrator/post-migration.sql` — added `dismissed_at` to column-level GRANT UPDATE list
- `drizzle/0019_phase04_budgets_timezone.sql` — renamed from 0018 to resolve naming conflict
- `drizzle/meta/_journal.json` — registered migrations 0018 + 0019 in journal

## Decisions Made

- Integration tests use `BEGIN + set_config('app.tenant_ids', ..., false)` pattern for verification queries — the `false` flag makes GUC persistent for the transaction (not just the current statement), required for RLS policies to work
- spendings-summary RSCM-04 test uses `effective_from = '2026-05-01'` (current month) instead of a prior date — this avoids reserve accumulation from prior months in the category_reserve_balance VIEW, ensuring overspent scenario is deterministic
- The `category_reserve_balance` VIEW accumulates reserve from ALL past months since first limit was set — test scenarios must account for this behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] category-repo.ts reorder(): sort_index type cast**

- **Found during:** Task 2 (categories-sort-order integration test)
- **Issue:** `UPDATE categories SET sort_index = data.idx FROM (VALUES ...) AS data(id, idx)` — drizzle sql-tagged params interpolate integers as text parameters; `sort_index` is `INTEGER` → "column is of type integer but expression is of type text"
- **Fix:** Changed `${idx + 1}` to `${idx + 1}::integer` in the VALUES tuple
- **Files modified:** `packages/budgeting/src/adapters/persistence/category-repo.ts`
- **Committed in:** `437fffc`

**2. [Rule 1 - Bug] post-migration.sql: dismissed_at missing from GRANT UPDATE**

- **Found during:** Task 2 (recurring-drafts-dismiss integration test returning 500)
- **Issue:** `expense_ledger` has table-level `REVOKE UPDATE` in post-migration.sql; column-level re-grants listed specific columns but `dismissed_at` was not included. The migration `0019_phase04_budgets_timezone.sql` adds `GRANT UPDATE (dismissed_at)` inline, but post-migration.sql runs AFTER migrations and overwrites that grant
- **Fix:** Added `dismissed_at` to the column-level GRANT UPDATE list in post-migration.sql; re-ran migrator to apply
- **Files modified:** `apps/migrator/post-migration.sql`
- **Committed in:** `437fffc`

**3. [Rule 3 - Blocking] packages/budgeting/package.json: missing exports for Phase 4 services**

- **Found during:** Task 2 (module not found errors in integration tests)
- **Issue:** New application services (`reorder-categories`, `dismiss-draft`, `confirm-draft`, `get-spendings-summary`) and adapters (`expense-ledger-draft-port-repo`, `spendings-summary-repo`) not exported from the package
- **Fix:** Added 9 new export entries to `packages/budgeting/package.json`
- **Files modified:** `packages/budgeting/package.json`
- **Committed in:** `437fffc`

**4. [Rule 1 - Bug] drizzle migration journal: naming conflict 0018 × 2**

- **Found during:** Task 3 (schema push)
- **Issue:** Two migration files both named `0018_*.sql` (from two separate agents); drizzle requires unique names
- **Fix:** Renamed `0018_phase04_spendings_grid_schema.sql` → `0019_phase04_budgets_timezone.sql`; registered both in `_journal.json`
- **Files modified:** `drizzle/meta/_journal.json`, renamed migration file
- **Committed in:** `437fffc`

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocking, 1 Rule 1 naming conflict)
**Impact on plan:** All auto-fixes necessary for correctness (type safety, RLS permissions, module resolution). No scope creep.

## Issues Encountered

- `dismissed_at` column has `SELECT + INSERT` in information_schema but not `UPDATE` — root cause: post-migration.sql runs after migrations and REVOKES UPDATE, then re-grants only explicitly listed columns. New columns added in migration files need to be added to post-migration.sql's GRANT list, not just in the migration file itself.
- `category_reserve_balance` VIEW accumulates reserve from all past months — spendings-summary test for RSCM-04 overflow needed effective_from = current month to avoid reserve absorbing the overspent amount.
- RLS verification in integration tests: both `app_role` and `migrator` role have `NOBYPASSRLS`. Only `postgres` role bypasses. Tests use `BEGIN + set_config(..., false)` to persist GUCs across the transaction.

## Known Stubs

None — all routes return real data from Postgres.

## Threat Flags

| Flag                                | File                                   | Description                                                                                                                                |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| threat_flag: tenant-isolation-write | apps/api/src/routes/categories.ts      | PUT sort-order uses budgetId != tenantId check at application layer — RLS provides secondary defense; integration test T-04-02-08 verified |
| threat_flag: tenant-isolation-write | apps/api/src/routes/recurring-rules.ts | POST dismiss/confirm uses budgetId != tenantId check — integration tests D-PH4-E3 verified                                                 |

## Next Phase Readiness

- All 4 routes deployed and tested against real Postgres
- DTO shape (`SpendingsSummaryDTO` with `budgetTz` at top level) ready for Plan 04-03 RSC consumption
- Sort-order persistence ready for Plan 04-04 drag-drop client
- Dismiss/confirm ready for Plan 04-04 recurring draft UI

---

_Phase: 04-spendings-grid_
_Completed: 2026-05-13_
