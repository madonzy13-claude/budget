---
phase: 04-spendings-grid
plan: "01"
subsystem: web-frontend, db-schema, e2e, ci
tags: [wave-0, deps, extract, i18n, e2e-scaffold, ci-gate, schema-spike]
dependency_graph:
  requires: []
  provides:
    - "@dnd-kit/core@6.3.1 + @dnd-kit/sortable@10.0.0 + @dnd-kit/utilities@3.2.2 in apps/web"
    - "temporal-polyfill in apps/web"
    - "AmountInput, DateInput, FxPreviewLine in components/budgeting/fields/"
    - "generateIdempotencyKey() in lib/idempotency.ts"
    - "grid.* i18n namespace in en/pl/uk messages"
    - "SpendingsPage page object + spendings.steps.ts + placeholder.feature"
    - "drizzle/0018 migration (idempotent dismissed_at)"
    - "expense-ledger-draft-schema.ts Drizzle table def with dismissedAt"
    - "tenant-leak gate at 10 files (was 7)"
  affects:
    - "Plans 04-02 through 04-05 (all unblocked)"
tech_stack:
  added:
    - "@dnd-kit/core@6.3.1"
    - "@dnd-kit/sortable@10.0.0"
    - "@dnd-kit/utilities@3.2.2"
    - "temporal-polyfill@0.3.2"
  patterns:
    - "Controlled-primitive field extraction (AmountInput, DateInput, FxPreviewLine)"
    - "Centralized idempotency key via lib/idempotency.ts"
    - "Tenant-leak gate stub pattern (placeholder test, plan-N fills)"
key_files:
  created:
    - apps/web/src/components/budgeting/fields/amount-input.tsx
    - apps/web/src/components/budgeting/fields/date-input.tsx
    - apps/web/src/components/budgeting/fields/fx-preview-line.tsx
    - apps/web/src/lib/idempotency.ts
    - drizzle/0018_phase04_expense_ledger_dismissed_at.sql
    - packages/budgeting/src/adapters/persistence/expense-ledger-draft-schema.ts
    - tests/e2e/features/spendings/placeholder.feature
    - tests/e2e/pages/SpendingsPage.ts
    - tests/e2e/steps/spendings.steps.ts
    - tests/tenant-leak/sort-order-cross-tenant.test.ts
    - tests/tenant-leak/spendings-summary-cross-tenant.test.ts
    - tests/tenant-leak/drafts-dismiss-cross-tenant.test.ts
  modified:
    - apps/web/package.json (added 4 deps)
    - apps/web/messages/en.json (grid.* namespace, 50+ keys)
    - apps/web/messages/pl.json (grid.* namespace, EN fallback)
    - apps/web/messages/uk.json (grid.* namespace, EN fallback)
    - apps/web/src/components/budgeting/transaction-capture-form.tsx (import idempotency)
    - apps/web/src/components/budgeting/transaction-edit-form.tsx (import idempotency)
  deleted:
    - apps/web/src/components/budgeting/transaction-search-bar.tsx
    - apps/web/src/components/budgeting/transaction-filter-chips.tsx
    - apps/web/src/components/budgeting/bulk-action-bar.tsx
    - apps/web/src/components/budgeting/pending-drafts-inbox.tsx
    - apps/web/src/components/budgeting/transaction-row-edit.tsx
    - apps/web/src/components/budgeting/transaction-row-client.tsx
    - apps/web/src/components/budgeting/transaction-list.tsx
    - apps/web/src/components/budgeting/edit-history-panel.tsx
decisions:
  - "dismissed_at already present in live DB — migration is idempotent (IF NOT EXISTS)"
  - "category_reserve_balance VIEW has balance_cents only — no used_this_month; Plan 04-02 must compute server-side in getSpendingsSummary"
  - "categories.icon and categories.color absent from DB — Plans 04-02/04-03 must add columns or treat as nullable"
  - "i18n uses single-file per locale (en.json not en/grid.json) — grid key appended to root object"
  - "tenant-leak gate count 7->10 (stubs); was 5->6 in 03-02, +1 in 03-03, now +3 for Phase 4 routes"
metrics:
  duration: "14m"
  completed_date: "2026-05-13"
  tasks_completed: 3
  tasks_total: 4
  files_created: 12
  files_modified: 6
  files_deleted: 8
---

# Phase 4 Plan 01: Wave 0 Prerequisites Summary

Wave 0 prerequisites complete: dnd-kit + temporal-polyfill installed, schema spike recorded, field primitives extracted, i18n grid namespace stubbed for all 3 locales, E2E directory + page object + step file scaffolded, 8 v1.0 surfaces deleted, and tenant-leak CI gate bumped 7→10.

## Schema Spike Findings

| Column         | Table                      | Exists? | Notes                                                 |
| -------------- | -------------------------- | ------- | ----------------------------------------------------- |
| `sort_index`   | `budgeting.categories`     | YES     | INTEGER NOT NULL DEFAULT 0 — drag reorder ready       |
| `icon`         | `budgeting.categories`     | NO      | Must add in Plan 04-02 migration or treat as nullable |
| `color`        | `budgeting.categories`     | NO      | Same as icon                                          |
| `dismissed_at` | `budgeting.expense_ledger` | YES     | TIMESTAMPTZ NULL — already present in live DB         |

### `category_reserve_balance` VIEW columns (resolves RESEARCH Open Q1)

```
budget_id     uuid
category_id   uuid
tenant_id     uuid
balance_cents numeric
```

**Decision:** VIEW exposes `balance_cents` only — no `used_this_month` column. Plan 04-02 `getSpendingsSummary` must compute `used_this_month` server-side by aggregating `expense_ledger` rows for the requested month.

## New Dependencies Installed

| Package              | Version | Purpose                               |
| -------------------- | ------- | ------------------------------------- |
| `@dnd-kit/core`      | 6.3.1   | Drag-and-drop foundation              |
| `@dnd-kit/sortable`  | 10.0.0  | Sortable column reordering            |
| `@dnd-kit/utilities` | 3.2.2   | CSS utilities for dnd-kit             |
| `temporal-polyfill`  | 0.3.2   | TZ-correct month boundary computation |

## Files Deleted (8 v1.0 surfaces, GRID-12 + RECR-07)

1. `transaction-search-bar.tsx`
2. `transaction-filter-chips.tsx`
3. `bulk-action-bar.tsx`
4. `pending-drafts-inbox.tsx`
5. `transaction-row-edit.tsx`
6. `transaction-row-client.tsx`
7. `transaction-list.tsx`
8. `edit-history-panel.tsx`

TypeScript compile errors from these deletions are expected and will be cleared in Plans 04-03/04-04.

## Files Created (12)

- 3 field primitives: `AmountInput`, `DateInput`, `FxPreviewLine` in `fields/`
- `lib/idempotency.ts` — centralized `generateIdempotencyKey()`
- `drizzle/0018_phase04_expense_ledger_dismissed_at.sql` — idempotent migration
- `expense-ledger-draft-schema.ts` — Drizzle table def with `dismissedAt`
- 3 E2E files: `placeholder.feature`, `SpendingsPage.ts`, `spendings.steps.ts`
- 3 tenant-leak stubs: sort-order, spendings-summary, drafts-dismiss

## i18n Keys Created

50+ keys in `grid.*` namespace across EN/PL/UK (`pl.json` and `uk.json` use EN strings as fallback; Phase 8 will ship proper translations).

Key groups: `txnSlider.*`, `catSlider.*`, `draft.*`, `row.*`, `txn.*`, `quickEntry.*`, `monthNav.*`, `addCategory.*`, `emptyState.*`, `error.*`, `confirm.*`, `header.*`

## Tenant-Leak CI Gate

| State                        | Count                                      |
| ---------------------------- | ------------------------------------------ |
| Before Phase 4               | 7 files                                    |
| After Plan 04-01 (this plan) | 10 files                                   |
| Target (Phase 4 complete)    | 10 real tests (stubs filled in Plan 04-02) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] ESLint: unused `boolean` import in expense-ledger-draft-schema.ts**

- Found during: Task 1 commit
- Fix: Removed `boolean` from drizzle-orm/pg-core import list
- Commit: f62cdf6

**2. [Rule 2 - Missing functionality] ESLint: unused `expect` import in SpendingsPage.ts**

- Found during: Task 3 commit
- Fix: Removed `expect` from @playwright/test import
- Commit: 7927b57

**3. [Rule 1 - Bug] import statement placement in transaction-edit-form.tsx**

- Found during: Task 2 (linter auto-fixed)
- The `import { generateIdempotencyKey }` was placed mid-file; linter moved it to top per ES module rules
- Commit: e0707db (auto-corrected by lint-staged)

### Schema Deviations

**`dismissed_at` already in live DB** — migration 0018 created with `IF NOT EXISTS` guards so it is idempotent. No data migration needed. Recorded as deviation from plan assumption ("likely absent per Pitfall 10").

**`categories.icon` and `categories.color` absent** — plan noted these may be absent. Confirmed absent. Plan 04-02 must add them via migration or handle nullable in UI.

## Known Stubs

| Stub                                   | File                                                               | Reason                                                                           |
| -------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `When "I open the Spendings tab"` step | `spendings.steps.ts`                                               | Navigates to `/en/budgets/active`; Plan 04-05 ships dynamic budget ID resolution |
| 3 tenant-leak test bodies              | `sort-order/spendings-summary/drafts-dismiss-cross-tenant.test.ts` | Route + service don't exist yet; Plan 04-02 fills bodies                         |

## Self-Check

---

## Self-Check: PASSED

Files confirmed:

- `apps/web/src/components/budgeting/fields/amount-input.tsx` — FOUND
- `apps/web/src/components/budgeting/fields/date-input.tsx` — FOUND
- `apps/web/src/components/budgeting/fields/fx-preview-line.tsx` — FOUND
- `apps/web/src/lib/idempotency.ts` — FOUND
- `tests/e2e/features/spendings/placeholder.feature` — FOUND
- `tests/e2e/pages/SpendingsPage.ts` — FOUND
- `tests/e2e/steps/spendings.steps.ts` — FOUND
- `drizzle/0018_phase04_expense_ledger_dismissed_at.sql` — FOUND
- `packages/budgeting/src/adapters/persistence/expense-ledger-draft-schema.ts` — FOUND

Commits confirmed: a7df788, f62cdf6, e0707db, 9a240e8, 7927b57

Missing: `transaction-search-bar.tsx` — CONFIRMED DELETED (expected)
Missing: `pending-drafts-inbox.tsx` — CONFIRMED DELETED (expected)
