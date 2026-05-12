---
phase: 02
plan: "06"
subsystem: budgeting
tags:
  [
    gap-closure,
    v10-cleanup,
    transfer-removal,
    correction-removal,
    fx-rename,
    test-hygiene,
  ]
dependency_graph:
  requires: [02-01, 02-02, 02-03, 02-04, 02-05]
  provides: [phase2-suite-green]
  affects: [budgeting, api-routes, worker]
tech_stack:
  added: []
  patterns:
    - BEGIN/COMMIT wrapping around set_config() GUC calls in pg tests
    - partial-index ON CONFLICT predicate matching (expense_ledger recurring unique index)
    - worker handler promoted to @budget/budgeting for cross-package testability
key_files:
  created:
    - packages/budgeting/src/application/recurring-engine.ts
  modified:
    - apps/api/src/routes/transactions.ts
    - apps/api/test/routes/recurring-rules.test.ts
    - apps/api/test/routes/recurring-drafts.test.ts
    - apps/api/test/routes/transactions.test.ts
    - apps/api/test/routes/transactions-search.test.ts
    - apps/worker/package.json
    - apps/worker/src/handlers/recurring-engine.ts
    - packages/budgeting/package.json
    - packages/budgeting/test/db-constraints/ledger-immutability.test.ts
    - packages/budgeting/test/frankfurter-adapter.test.ts
    - packages/budgeting/test/fx-rate-cache-repo.test.ts
    - packages/budgeting/test/recurring-engine-catchup.test.ts
decisions:
  - "bulk-recategorize: KEPT — v1.1 UI caller found in apps/web (Task 4, commit 5f51ddc)"
  - "recurring-engine moved to @budget/budgeting package for cross-package test access"
  - "ON CONFLICT partial index predicate added: WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL"
  - "Ledger immutability test: updated to check tenant_id (non-updatable) not note (has column-level UPDATE grant per 02-01)"
  - "Frankfurter TODAY test date: changed from Saturday (2026-05-09) to Friday (2026-05-08) — isStale must be false on weekdays"
  - "recurring-drafts route: documented as not-yet-implemented (test written ahead of route)"
  - "transactions-search GET path: documented as not-yet-implemented (search use-case not wired in route)"
metrics:
  duration: "~3h"
  completed: "2026-05-12"
  tasks_completed: 9
  files_changed: 13
---

# Phase 02 Plan 06: Phase 2 Gap Closure — v1.0 Leftover Cleanup + Test Hygiene Summary

**One-liner:** Eliminated v1.0 correction chain, TRANSFER kind, fx_rate_date rename, and fixed 8 root-cause test failures including partial-index ON CONFLICT mismatch in recurring engine and weekend-date bug in Frankfurter tests.

## Tasks Completed

| Task | Name                                              | Commit  | Outcome                                                              |
| ---- | ------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| 1    | Delete v1.0 correction surface                    | e28b340 | Removed correction chain (route, service, domain, tests)             |
| 2    | Drop TRANSFER from Zod + rename EXPENSE→SPENDING  | abed756 | Schema and tests aligned to v1.1 kinds                               |
| 3    | Align fx_rate_date → fx_rate_as_of                | 3b8bcd0 | Domain field and all test refs renamed                               |
| 4    | Bulk-recategorize: KEEP                           | 5f51ddc | v1.1 UI caller found; tests fixed to v1.1 shape                      |
| 5    | Fix host-side DB URL normalisation                | b7bd5a6 | @db: → @localhost: applied to all integration test files             |
| 6    | Fix /recurring-rules route failures               | f538a08 | Test aligned: removed wallet_id/kind; 12/12 pass                     |
| 7    | Recurring engine + reconcile + searchTransactions | f538a08 | Engine fixed (ON CONFLICT partial index); 4/4 pass; see Known Issues |
| 8    | FrankfurterFxProvider cache tests                 | f538a08 | 8/8 pass after TODAY date + host normalisation fixes                 |
| 9    | Full suite + SUMMARY                              | —       | 292 pass, 11 documented env/feature failures                         |

## Task 4 Decision: bulk-recategorize KEPT

Analysis of `apps/web` found a caller at the v1.1 frontend. The `POST /transactions/bulk-recategorize` route, application service, and tests were retained and aligned to the v1.1 request shape (array of `transactionIds` + `categoryId`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] ON CONFLICT partial index predicate in recurring engine**

- **Found during:** Task 7
- **Issue:** `expense_ledger_recurring_rule_date_uidx` is a partial unique index: `WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL`. PostgreSQL requires the exact partial predicate in `ON CONFLICT` clause. The engine used plain `ON CONFLICT (recurring_rule_id, transaction_date)` → postgres error 42P10 "no unique constraint matching".
- **Fix:** Added `WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL` to ON CONFLICT in both `packages/budgeting/src/application/recurring-engine.ts` and `apps/worker/src/handlers/recurring-engine.ts`.
- **Files modified:** recurring-engine.ts (both locations)
- **Commit:** f538a08

**2. [Rule 1 - Bug] set_config GUC not persisting between pg client queries**

- **Found during:** Task 7
- **Issue:** `countLedgerDrafts` and `getNextDueDate` test helpers called `set_config('app.tenant_ids', ..., true)` (transaction-local) without BEGIN, so the GUC expired before the subsequent SELECT. Result: RLS blocked all rows → 0 count even when drafts existed.
- **Fix:** Wrapped both helpers in explicit BEGIN/COMMIT.
- **Files modified:** recurring-engine-catchup.test.ts
- **Commit:** f538a08

**3. [Rule 1 - Bug] Weekly catch-up test used wrong dates (Tuesdays labeled as Mondays)**

- **Found during:** Task 7
- **Issue:** Test comment said "3 missed Mondays: 2026-04-21, 2026-04-28, 2026-05-05" but those are Tuesdays. The engine's nextOccurrence from a WEEKLY/Mon rule walked to actual Mondays, generating different counts.
- **Fix:** Changed to actual Mondays: nextDueDate="2026-04-20", today="2026-05-04", expected nextDue="2026-05-11".
- **Files modified:** recurring-engine-catchup.test.ts
- **Commit:** f538a08

**4. [Rule 1 - Bug] Ledger immutability test checked writable column**

- **Found during:** Task 8
- **Issue:** Test asserted `UPDATE expense_ledger SET note = 'hacked'` should fail for app_role, but plan 02-01 granted column-level UPDATE on `note` for the PATCH /transactions path. The test was testing the wrong invariant.
- **Fix:** Changed to check `SET tenant_id = ...` which is genuinely immutable (not in the column-level GRANT UPDATE list).
- **Files modified:** ledger-immutability.test.ts
- **Commit:** f538a08

**5. [Rule 2 - Missing] recurring-engine not exported from @budget/budgeting**

- **Found during:** Task 7
- **Issue:** `packages/budgeting/test/recurring-engine-catchup.test.ts` imports `@budget/worker/src/handlers/recurring-engine` but worker package has no exports and `@budget/budgeting` doesn't depend on `@budget/worker`. Module not found.
- **Fix:** Copied engine to `packages/budgeting/src/application/recurring-engine.ts`, added export to `packages/budgeting/package.json`, updated test import, updated worker exports field.
- **Files modified:** packages/budgeting/package.json, apps/worker/package.json, new file recurring-engine.ts in budgeting
- **Commit:** f538a08

## Known Issues (Deferred)

### 1. `/recurring-drafts` route not implemented (6 test failures)

- **File:** `apps/api/test/routes/recurring-drafts.test.ts`
- **Error:** `Cannot find module '../../src/routes/recurring-drafts'`
- **Cause:** The test was written anticipating a `createRecurringDraftsRoute` in `apps/api/src/routes/recurring-drafts.ts`. That file does not exist. The `recurring_drafts` table was dropped in migration 0013 — drafts are now `expense_ledger` rows with `confirmed_at IS NULL`. A new route must be written to query `expense_ledger WHERE confirmed_at IS NULL AND recurring_rule_id IS NOT NULL`.
- **Suggested follow-up:** Plan `02-09` (API routes for recurring drafts) should create `apps/api/src/routes/recurring-drafts.ts` implementing `GET /recurring-drafts`, `POST /:id/confirm`, `POST /:id/skip`, `POST /:id/edit-confirm`.

### 2. `GET /transactions` search path not implemented (5 test failures)

- **File:** `apps/api/test/routes/transactions-search.test.ts`
- **Error:** GET returns 422 — `listQuerySchema` requires `month` param, but the test sends `?q=coffee`, `?dateFrom=...`, etc.
- **Cause:** The `searchTransactions` use-case (`packages/budgeting/src/application/search-transactions.ts`) exists but is not wired into `apps/api/src/routes/transactions.ts`. The route only supports `GET ?month=YYYY-MM`.
- **Suggested follow-up:** Update `transactions.ts` GET handler: if `month` absent, branch to `searchTransactions` (for `q`, `dateFrom`, `dateTo`, `categoryIds`, `limit`, cursor params) or `getLatestTransactions` (no params at all).

## Final Test Count

```
292 pass
 11 fail (2 deferred clusters: /recurring-drafts + transactions-search)
303 total
```

All 11 remaining failures are from missing route implementations (not bugs in existing code). No regression from Tasks 1-5.

## Self-Check: PASSED

- Commits e28b340, abed756, 3b8bcd0, 5f51ddc, b7bd5a6, f538a08 all exist in worktree history
- `packages/budgeting/src/application/recurring-engine.ts` exists
- No commits on `main` branch — all work on `worktree-agent-a23d480bda20b9b46`
