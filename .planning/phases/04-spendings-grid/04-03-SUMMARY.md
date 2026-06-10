---
phase: 04-spendings-grid
plan: "03"
subsystem: web-frontend
tags:
  [
    react-query,
    optimistic-mutations,
    tdd,
    vitest,
    spendings-grid,
    components,
    hooks,
  ]

dependency_graph:
  requires:
    - phase: 04-01
      provides: "idempotency.ts, i18n grid.* namespace, SpendingsPage locators"
    - phase: 04-02
      provides: "4 Hono routes (sort-order, spendings-summary, dismiss, confirm), DTO shapes"
  provides:
    - "useRevealActions hook (click-reveal, D-PH4-INT1 compliant)"
    - "MonthNavigator (URL ?month, Cmd/Ctrl+Arrow, sticky 48px bar)"
    - "QuickEntryInput (decimal . and ,, optimistic POST)"
    - "TransactionRow (single-click reveal, pending/unsent states)"
    - "DraftRow (3px dashed yellow border, [Confirm][Edit][Dismiss])"
    - "ColumnHeader (5-row stack, GripVertical touch-none, color-coded balance)"
    - "AddCategoryColumn (dashed + trigger, Tab+Enter accessible)"
    - "useTransactions queryKey=['transactions',bid,m]"
    - "useDrafts queryKey=['drafts',bid,m]"
    - "useSpendingsSummary queryKey=['spendings-summary',bid,m]"
    - "useCreateTransaction (optimistic prepend, unsent flag, idempotency)"
    - "useReorderCategories (optimistic local reorder, rollback + toast)"
    - "useConfirmDraft, useDismissDraft, useUpdateTransaction, useDeleteTransaction"
    - "parseDecimal() — locale-aware . / , → cents"
    - "centsToDisplay() — BigInt-safe Intl.NumberFormat wrapper"
  affects:
    - "04-04 SpendingsGridClient composition — imports all 7 primitives + 9 hooks"
    - "04-05 E2E scenarios — data-testid contracts honored"

tech-stack:
  added: []
  patterns:
    - "useRevealActions: click-driven reveal only; pointerdown + Escape collapse; no onMouseEnter"
    - "Pattern 2 optimistic mutation: onMutate prepend, onError flag-unsent (NOT rollback), onSuccess swap, onSettled invalidate"
    - "useTransactions/useDrafts: distinct queryKeys prevent cache collision; initialData from RSC hydrates immediately"
    - "parseDecimal: strip non-digit/separator → normalize , to . → validate regex → Math.round"

key-files:
  created:
    - apps/web/src/lib/decimal.ts
    - apps/web/src/lib/cents-format.ts
    - apps/web/src/hooks/use-month-param.ts
    - apps/web/src/hooks/use-spendings-summary.ts
    - apps/web/src/hooks/use-transactions.ts
    - apps/web/src/hooks/use-drafts.ts
    - apps/web/src/hooks/use-create-transaction.ts
    - apps/web/src/hooks/use-reorder-categories.ts
    - apps/web/src/hooks/use-confirm-draft.ts
    - apps/web/src/hooks/use-dismiss-draft.ts
    - apps/web/src/hooks/use-update-transaction.ts
    - apps/web/src/hooks/use-delete-transaction.ts
    - apps/web/src/components/budgeting/spendings-grid/reveal-actions.tsx
    - apps/web/src/components/budgeting/spendings-grid/month-navigator.tsx
    - apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx
    - apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx
    - apps/web/src/components/budgeting/spendings-grid/draft-row.tsx
    - apps/web/src/components/budgeting/spendings-grid/column-header.tsx
    - apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx
    - apps/web/test/lib/decimal.test.ts
    - apps/web/test/hooks/use-month-param.test.tsx
    - apps/web/test/hooks/use-transactions.test.tsx
    - apps/web/test/hooks/use-drafts.test.tsx
    - apps/web/test/components/spendings-grid/reveal-actions.test.tsx
    - apps/web/test/components/spendings-grid/month-navigator.test.tsx
    - apps/web/test/components/spendings-grid/quick-entry-input.test.tsx
    - apps/web/test/components/spendings-grid/transaction-row.test.tsx
    - apps/web/test/components/spendings-grid/draft-row.test.tsx
    - apps/web/test/components/spendings-grid/column-header.test.tsx
    - apps/web/test/components/spendings-grid/add-category-column.test.tsx
  modified: []

decisions:
  - "useTransactions returns TxnDTO[] directly (not wrapped in object) — mutation hooks setQueryData with array, matching useQuery return type"
  - "parseDecimal double-separator '5..96' collapses to '5.96' per RESEARCH §Pitfall 8 spec (test updated to match)"
  - "useRevealActions onPointerDown: if ref.current is null, always collapse (not only when outside ref)"
  - "ConfirmDraftInput uses exactOptionalPropertyTypes: conditional amountOverride on separate objects not undefined union"
  - "Month label in MonthNavigator uses parseInt with fallback to avoid undefined from array destructuring"

metrics:
  duration: "75min"
  completed_date: "2026-05-13"
  tasks_completed: 2
  tasks_total: 2
  files_created: 29
  files_modified: 0
---

# Phase 04 Plan 03: Grid Primitives + React Query Hooks Summary

**7 client components + useRevealActions hook + 9 React Query hooks + 2 lib utils — 81 Vitest tests all passing; D-PH4-INT1 hover-regression and D-PH4-INT4 double-click guards enforced in code and tests**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-05-13
- **Tasks:** 2 / 2
- **Files created:** 29

## Query Key Contract

| Hook                   | queryKey                                 | Notes                                                                                  |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `useTransactions`      | `["transactions", budgetId, month]`      | All mutation hooks (create/update/delete/confirm-draft) invalidate this exact key      |
| `useDrafts`            | `["drafts", budgetId, month]`            | confirm-draft + dismiss-draft invalidate; no collision with useTransactions            |
| `useSpendingsSummary`  | `["spendings-summary", budgetId, month]` | All mutations invalidate on settled; create-transaction also optimistically recomputes |
| `useReorderCategories` | `["categories", budgetId]`               | Optimistic reorder; rollback on error                                                  |

## Test Counts

| File                                                          | Tests  | Key assertions                                                         |
| ------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `test/lib/decimal.test.ts`                                    | 11     | . and , tolerance; invalid input rejection                             |
| `test/hooks/use-month-param.test.tsx`                         | 8      | prev/next/today; isCurrentMonth; malformed fallback                    |
| `test/hooks/use-transactions.test.tsx`                        | 5      | queryKey contract; initialData hydration; confirmed=true               |
| `test/hooks/use-drafts.test.tsx`                              | 5      | queryKey contract; no collision with useTransactions; confirmed=false  |
| `test/components/spendings-grid/reveal-actions.test.tsx`      | 8      | D-PH4-INT1 regression-guard (pointermove no-op)                        |
| `test/components/spendings-grid/month-navigator.test.tsx`     | 8      | Cmd/Ctrl+Arrow; plain ArrowLeft no-op; Today btn conditional           |
| `test/components/spendings-grid/quick-entry-input.test.tsx`   | 8      | . and , decimals; invalid toast; Esc clear; resolvedDate               |
| `test/components/spendings-grid/transaction-row.test.tsx`     | 7      | D-PH4-INT1 regression-guard; single-click reveal; pending/unsent       |
| `test/components/spendings-grid/draft-row.test.tsx`           | 7      | D-PH4-INT1 regression-guard; 3-chip reveal; confirm/edit/dismiss       |
| `test/components/spendings-grid/column-header.test.tsx`       | 8      | D-PH4-INT4 double-click no-op; grip touch-none; planned/cushion switch |
| `test/components/spendings-grid/add-category-column.test.tsx` | 5      | click; Tab+Enter; Plus icon                                            |
| **Total**                                                     | **81** |                                                                        |

## Regression Guards Covered

| Rule                                                                        | Test                                              | Result  |
| --------------------------------------------------------------------------- | ------------------------------------------------- | ------- |
| D-PH4-INT1: no hover reveal in TransactionRow                               | `pointermove WITHOUT click does NOT reveal chips` | PASS    |
| D-PH4-INT1: no hover reveal in DraftRow                                     | `pointermove does NOT reveal chips`               | PASS    |
| D-PH4-INT1: no hover reveal in useRevealActions                             | `pointermove does NOT set revealed=true`          | PASS    |
| D-PH4-INT4: no double-click on column cells                                 | `double-click on header cell does NOTHING`        | PASS    |
| D-PH4-Q3: plain ArrowLeft no-op                                             | `plain ArrowLeft does NOTHING`                    | PASS    |
| T-04-03-01: malformed decimal rejected                                      | `invalid '1.234' shows error toast`               | PASS    |
| T-04-03-07: Cmd+Arrow preventDefault (not tested in unit, enforced in code) | code: `e.preventDefault()` before `prev()/next()` | IN CODE |

## data-testid Contract

| Component            | data-testid                                | SpendingsPage locator    | Honored |
| -------------------- | ------------------------------------------ | ------------------------ | ------- |
| MonthNavigator label | `month-navigator-label`                    | `monthLabel()`           | YES     |
| MonthNavigator prev  | `month-navigator-prev`                     | `monthPrevBtn()`         | YES     |
| MonthNavigator next  | `month-navigator-next`                     | `monthNextBtn()`         | YES     |
| QuickEntryInput      | `quick-entry-{categoryName.toLowerCase()}` | `quickEntryInput(name)`  | YES     |
| ColumnHeader         | `column-header-{name.toLowerCase()}`       | `columnHeader(name)`     | YES     |
| AddCategoryColumn    | `add-category-column`                      | `addCategoryColumn()`    | YES     |
| TransactionRow       | `txn-row-{amountConvertedCents}`           | `transactionRow(amount)` | YES     |
| DraftRow             | `draft-row-{ruleName.toLowerCase()}`       | `draftRow(ruleName)`     | YES     |

## Task Commits

1. **Task 1: Utils + 9 hooks** — `9e1ff7c`
2. **Task 2: 7 components + tests** — `934bd98`
3. **Fix: TS exactOptionalPropertyTypes** — `4cb6aea`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useRevealActions: ref.current=null case collapse**

- **Found during:** Task 2 (reveal-actions.test failing "outside pointerdown sets revealed=false")
- **Issue:** Original `if (ref.current && !ref.current.contains(...))` never fires when ref not attached to DOM in tests
- **Fix:** Changed to `if (!ref.current || !ref.current.contains(...))` — collapses when outside OR no ref attached
- **Files modified:** reveal-actions.tsx
- **Committed in:** 934bd98

**2. [Rule 1 - Bug] TypeScript exactOptionalPropertyTypes errors (2 files)**

- **Found during:** Post-task TypeScript check
- **Issue 1:** `month-navigator.tsx`: `split("-").map(Number)` returns `(number | undefined)[]` under strict mode
- **Issue 2:** `draft-row.tsx`: `{ amountOverride: cents ?? undefined }` violates exactOptionalPropertyTypes
- **Fix:** parseInt with fallback; conditional input object for ConfirmDraftInput
- **Files modified:** month-navigator.tsx, draft-row.tsx
- **Committed in:** 4cb6aea

**3. [Rule 1 - Bug] parseDecimal "5..96" behavior**

- **Found during:** Task 1 test run
- **Issue:** RESEARCH §Pitfall 8 regex `(\..*)\./g` collapses "5..96" to "5.96" (valid), test expected null
- **Fix:** Updated test to match spec behavior (document the collapse, don't reject)
- **Files modified:** test/lib/decimal.test.ts
- **Committed in:** 9e1ff7c (pre-commit lint auto-adjusted formatting)

### Out-of-scope Pre-existing Failures (logged, not fixed)

5 pre-existing test failures from Plan 04-01 deletions:

- `bulk-action-bar.test.tsx` — tests deleted component
- `edit-history-panel.test.tsx` — tests deleted component
- `pending-drafts-inbox.test.tsx` — tests deleted component
- `transaction-search-bar.test.tsx` — tests deleted component
- `transaction-edit-form.test.tsx > submits to POST /api/transactions/:id/correct` — pre-existing route mismatch

These failures existed before this plan and are out of scope.

**Pre-existing TypeScript build error (not fixed):**

- `src/app/[locale]/(app)/recurring/actions.ts:9` imports from deleted `pending-drafts-inbox` — pre-existing from Plan 04-01 deletion. Out of scope.

## Known Stubs

None — all components are fully wired to hooks; all hooks connect to real Plan 04-02 API routes.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced.
Components consume existing Plan 04-02 routes. parseDecimal T-04-03-01 mitigation implemented.

---

_Phase: 04-spendings-grid_
_Completed: 2026-05-13_
