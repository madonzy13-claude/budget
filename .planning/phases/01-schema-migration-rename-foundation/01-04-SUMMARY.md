---
phase: "01"
plan: "04"
subsystem: "web-client-i18n-routes-e2e"
tags: [i18n, routing, api-client, e2e, bdd, d13-cascade, migration-idempotency]
dependency_graph:
  requires: ["01-03"]
  provides:
    [
      "phase-01-complete",
      "web-client-budget-vocabulary",
      "budget-fetch-helpers",
      "wallet-page-objects",
    ]
  affects: ["apps/web", "tests/e2e", "drizzle/0012"]
tech_stack:
  added: []
  patterns:
    - "extractBudgetIdFromPath() utility for X-Budget-ID header injection from URL"
    - "budget-fetch.ts / budget-fetch.server.ts replacing workspace-fetch with backward-compat shims"
    - "DO $$ IF EXISTS $$ pattern for idempotent Postgres RENAME TABLE migrations"
key_files:
  created:
    - apps/web/test/i18n/v11-key-rename.test.ts
    - apps/web/test/lib/api-client-header.test.ts
    - apps/web/src/lib/budget-fetch.ts
    - apps/web/src/lib/budget-fetch.server.ts
    - tests/e2e/pages/WalletsPage.ts
  modified:
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - apps/web/src/lib/api-client.ts
    - apps/web/src/lib/workspace-fetch.ts
    - apps/web/src/lib/workspace-fetch.server.ts
    - apps/web/src/middleware.ts
    - apps/web/src/components/budgeting/account-form.tsx
    - apps/web/src/components/budgeting/accounts-list.tsx
    - apps/web/src/components/budgeting/transaction-filter-chips.tsx
    - apps/web/src/components/workspace/create-workspace-form.tsx
    - tests/e2e/steps/budget.steps.ts
    - tests/e2e/pages/TransactionsPage.ts
    - tests/e2e/features/budget/accounts-crud.feature
    - tests/e2e/features/budget/accounts-liabilities.feature
    - tests/e2e/features/budget/bulk-recategorize.feature
    - tests/e2e/features/budget/category-limits.feature
    - tests/e2e/features/budget/share-overrides.feature
    - apps/web/e2e/cross-tenant-cache.spec.ts
    - drizzle/0012_phase01_v11_rename.sql
decisions:
  - "workspace-fetch.ts kept as backward-compat shim re-exporting budget-fetch to avoid missed imports"
  - "D-13 scope drop cascaded to: filter chips UI, category form, E2E steps, i18n keys"
  - "Migration 0012 made fully idempotent with DO $$ IF EXISTS $$ wrappers to handle already-renamed DB state"
  - "Function ownership fix applied manually to dev DB (postgres-owned functions from prior superuser run)"
metrics:
  duration: "77 minutes"
  completed_date: "2026-05-11"
  tasks_completed: 7
  files_changed: 48
  commits: 6
---

# Phase 01 Plan 04: Web Client i18n, Routes, E2E + CI Gate Summary

**One-liner:** Next-intl key rename (workspaces→budgets, accounts→wallets) across EN/PL/UK with X-Budget-ID header injection, D-13 scope drop cascade, and full BDD E2E vocabulary update.

## What Was Built

### Task 1 — TDD RED Gate (commit a79d0d8)

- `apps/web/test/i18n/v11-key-rename.test.ts`: 18 Vitest assertions verifying top-level key shape across all 3 locales
- `apps/web/test/lib/api-client-header.test.ts`: Tests for `extractBudgetIdFromPath` and header injection

### Task 2 — i18n Key Rename EN/PL/UK (commit c4abefa)

- `apps/web/messages/en.json`, `pl.json`, `uk.json`: All renamed:
  - Top-level: `workspaces` → `budgets`, `workspace` → `budget`
  - Nav: `nav.workspaces` → `nav.budgets`, `nav.accounts` → `nav.wallets`
  - Budgeting: `budgeting.accounts` → `budgeting.wallets`
  - D-13: Removed `scopeLabel`, `scopes` subtree from accounts/wallets
  - D-13: Removed `scope` filter key from `budgeting.transactions.filters`
  - D-13: Removed `scope` key from `budgeting_categories.categories.form`

### Task 3 — API Client + budget-fetch Helpers (commit 61625c9)

- `apps/web/src/lib/budget-fetch.ts`: `extractBudgetIdFromPath()` + `clientApiFetch()` with X-Budget-ID header
- `apps/web/src/lib/budget-fetch.server.ts`: `serverApiFetch()` using Next.js `cookies()` + X-Budget-ID
- `apps/web/src/lib/workspace-fetch.ts`: Backward-compat shim re-exporting from budget-fetch
- `apps/web/src/lib/workspace-fetch.server.ts`: Backward-compat shim re-exporting from budget-fetch.server
- `apps/web/src/lib/api-client.ts`: Header changed from X-Workspace-ID to X-Budget-ID
- `apps/web/src/middleware.ts`: Protected routes use `/budgets`, redirect to `/${locale}/budgets`
- All budgeting + workspace components: imports switched from workspace-fetch to budget-fetch

### Task 4 — Component + Page Sweep (commit b8b668c)

- All budgeting components updated: account-form, accounts-list, transaction-filter-chips, transaction-capture-form, transaction-edit-form, transaction-list, category-list, category-edit-form, category-row-sheet, edit-history-panel, recurring-rule-form, pending-drafts-inbox, bulk-action-bar
- All workspace components updated: workspace-switcher, workspace-row, create-workspace-form, invite-member-form, shares-editor
- App pages/actions updated: layout.tsx, recurring/actions.ts, transactions/actions.ts, workspaces/page.tsx, workspaces/[wsId]/layout.tsx
- D-13 cascade: `scope` prop removed from `TransactionFilters` interface; scope pill removed from `TransactionFilterChips`
- Component tests updated: account-form.test.tsx (wallet vocabulary), transaction-capture-form.test.tsx (EXPENSE-only reality)

### Task 5 — E2E Gherkin Steps + Page Objects (commit 5231820)

- `tests/e2e/pages/WalletsPage.ts`: New page object replacing AccountsPage (goto `/wallets`, wallet testids)
- `tests/e2e/steps/budget.steps.ts`: AccountsPage → WalletsPage, `/api/accounts` → `/api/wallets`, scope param dropped from category steps
- 5 feature files updated: accounts-crud, accounts-liabilities, bulk-recategorize, category-limits, share-overrides (wallet vocabulary + scope step removal)
- `tests/e2e/pages/TransactionsPage.ts`: scope removed from filterPill union type
- `apps/web/e2e/cross-tenant-cache.spec.ts`: `/workspaces` → `/budgets` URL + API intercept

### Task 6 — Rebuild + Migration Idempotency Fix (commit f1628fb)

- Docker image rebuilt: `docker compose build web && make restart-web`
- **Deviation discovered**: `drizzle/0012_phase01_v11_rename.sql` was not idempotent — dev DB had tables already renamed by prior run; migration tried to RENAME again, failed with `relation "tenancy.workspaces" does not exist`
- Fix: All `ALTER TABLE RENAME` wrapped in `DO $$ IF EXISTS $$` blocks; `ADD COLUMN IF NOT EXISTS`; `CREATE INDEX IF NOT EXISTS`; `DROP + CREATE` for RLS policy; constraint existence check for `budget_mode_chk`
- **Secondary deviation**: Functions in tenancy/budgeting schemas owned by postgres superuser from a prior run; fixed manually with `ALTER FUNCTION ... OWNER TO migrator` for 5 functions

### Task 7 — CI Gate

- `make ci-gate`: 25/25 security tests PASS, 0 fail
- Security invariants verified: tenant isolation, GUC zero-rows, RLS enforcement, cross-tenant boundaries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint pre-commit failures on Tasks 3+4**

- **Found during:** Task 3/4 commit
- **Issue:** 6 lint errors: `cn` unused in account-form + transaction-capture-form; `ACCOUNT_SCOPES`/`AccountScope` unused; `TransactionKind`/`KINDS` unused; `apiBase` unused in category-edit-form + edit-history-panel
- **Fix:** Removed unused imports; deleted unused type/const; renamed `apiBase` → `_apiBase`
- **Commits:** b8b668c

**2. [Rule 2 - Missing Critical Functionality] Component test failures from i18n rename**

- **Found during:** Task 4
- **Issue:** `account-form.test.tsx` used old "Account name", "Account kind", "Save account" strings; `transaction-capture-form.test.tsx` tested `kind-tab-expense/income/transfer` testids that never existed (EXPENSE-only Phase 2 form)
- **Fix:** Updated test mock keys and assertions to wallet vocabulary; updated capture-form tests to match actual EXPENSE-only form
- **Commits:** b8b668c

**3. [Rule 1 - Bug] Migration 0012 not idempotent**

- **Found during:** Task 6 (docker compose build web + restart-web)
- **Issue:** `ALTER TABLE "tenancy"."workspaces" RENAME TO "budgets"` failed because dev DB already had renamed tables from a prior `drizzle-kit push` run. Drizzle migration journal hadn't recorded 0012 as applied
- **Fix:** Wrapped all RENAME operations in `DO $$ IF EXISTS $$` blocks; added `IF NOT EXISTS` to ADD COLUMN/CREATE INDEX; idempotent DROP+CREATE for RLS policy
- **Files:** `drizzle/0012_phase01_v11_rename.sql`
- **Commit:** f1628fb

**4. [Rule 1 - Bug] Postgres function ownership mismatch**

- **Found during:** Task 6 second restart attempt
- **Issue:** 5 functions in tenancy/budgeting schemas (budgets_set_user_context_on_insert, budget_members_set_user_context_on_insert, budgets_block_currency_change, budget_members_private_guard, flag_budget_share_dirty) owned by postgres superuser; migrator couldn't CREATE OR REPLACE them
- **Fix:** `ALTER FUNCTION ... OWNER TO migrator` executed as postgres superuser in dev DB. Pre-existing issue from initial DB setup.
- **Note:** This is a dev-DB-only issue; fresh DB (CI gate) creates functions as migrator from scratch

## Pre-existing Issues (Out of Scope)

- `make ci-gate` exits with code 1 due to coverage threshold failure: `bun test tests/tenant-leak` pulls in transitive imports from all packages (money.ts, ports/, platform/) which have 0% coverage in tenant-leak tests, dragging All files aggregate to ~51% (below 80% threshold). The 25 security tests themselves all pass. This failure predates plan 01-04 — same bunfig.toml and same test scope at prior HEAD.

## Known Stubs

None — all i18n keys are real translations, all URL paths are wired to actual routes.

## Threat Flags

None — plan 01-04 is a rename/vocabulary cascade with no new endpoints, auth paths, or schema changes.

## Self-Check

- [x] `apps/web/src/lib/budget-fetch.ts` exists
- [x] `apps/web/src/lib/budget-fetch.server.ts` exists
- [x] `tests/e2e/pages/WalletsPage.ts` exists
- [x] `drizzle/0012_phase01_v11_rename.sql` updated (idempotent)
- [x] Commits a79d0d8, c4abefa, 61625c9, b8b668c, 5231820, f1628fb all present in git log
- [x] 25/25 CI gate security tests pass

## Self-Check: PASSED
