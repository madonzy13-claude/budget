---
phase: 04-spendings-grid
plan: "04"
subsystem: web-frontend
tags:
  [
    dnd-kit,
    react-query,
    optimistic-mutations,
    tdd,
    vitest,
    spendings-grid,
    sliders,
    rsc,
    composition,
  ]

dependency_graph:
  requires:
    - phase: 04-01
      provides: "field primitives (AmountInput, DateInput, FxPreviewLine), idempotency.ts, grid.* i18n"
    - phase: 04-02
      provides: "4 Hono routes, SpendingsSummaryDTO with budgetTz + budgetCurrency"
    - phase: 04-03
      provides: "7 grid primitives + 9 React Query hooks, transactionsByCatId queryKey contracts"
  provides:
    - "TransactionSlider — create/edit/delete Sheet form (480px desktop / 100vw mobile)"
    - "CategorySlider — create/edit Sheet form with icon+color pickers, SCD-2 limits flow"
    - "CategoryColumn — useSortable wrapper hosting ColumnHeader + rows + QuickEntryInput"
    - "SpendingsGridClient — DndContext island with slider state machine + hook-derived Maps"
    - "RSC spendings/page.tsx — 4-parallel-fetch shell, budgetTz from spendings-summary"
  affects:
    - "04-05 E2E — spendings page now renders real grid (replaces placeholder)"

tech-stack:
  added: []
  patterns:
    - "Slider state machine: txSlider + catSlider state objects in SpendingsGridClient"
    - "hook-derived Maps: transactionsByCatId / draftsByCatId from useTransactions/useDrafts .data"
    - "AddCategoryColumn outside SortableContext items (D-PH4-D4 — no useSortable call)"
    - "dragGripProps scoped to grip handle; listeners ?? {} for exactOptionalPropertyTypes"
    - "RSC 4-fetch pattern: serverApiFetch(budgetId, path) sets X-Budget-ID on all calls"

key-files:
  created:
    - apps/web/src/components/budgeting/transaction-slider.tsx
    - apps/web/src/components/budgeting/category-slider.tsx
    - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/test/components/budgeting/transaction-slider.test.tsx
    - apps/web/test/components/budgeting/category-slider.test.tsx
    - apps/web/test/components/spendings-grid/category-column.test.tsx
    - apps/web/test/components/spendings-grid/spendings-grid-client.test.tsx
  modified:
    - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx (RSC rewrite)
  deleted:
    - apps/web/src/components/budgeting/transaction-capture-form.tsx
    - apps/web/src/components/budgeting/transaction-capture-sheet.tsx
    - apps/web/src/components/budgeting/transaction-edit-form.tsx
    - apps/web/test/components/transaction-capture-form.test.tsx
    - apps/web/test/components/transaction-edit-form.test.tsx

decisions:
  - "AddCategoryColumn rendered outside SortableContext <div> items, sibling within DndContext — does NOT call useSortable"
  - "transactionsByCatId / draftsByCatId derived from hook .data (not props) — live mutations reflected without remount"
  - "dragGripProps: listeners ?? {} to satisfy exactOptionalPropertyTypes ColumnHeader contract"
  - "RSC no longer fetches /budgets/:id — budgetTz + budgetCurrency from spendings-summary DTO (D-PH4-Q5 fix)"
  - "Test files for deleted v1.0 forms also deleted (no point in orphaned import-fail tests)"

metrics:
  duration: "70min"
  completed_date: "2026-05-13"
  tasks_completed: 3
  tasks_total: 3
  files_created: 9
  files_modified: 1
  files_deleted: 5
---

# Phase 04 Plan 04: Grid Composition — Sliders + CategoryColumn + SpendingsGridClient + RSC Shell Summary

**TransactionSlider + CategorySlider + CategoryColumn + SpendingsGridClient + RSC spendings/page.tsx — 32 Vitest tests green; 3 v1.0 forms deleted; DndContext + SortableContext wired per RESEARCH pitfall guidelines**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-05-13
- **Tasks:** 3 / 3
- **Files created:** 9 (4 components + 4 test files + 1 modified RSC page)
- **Files deleted:** 5 (3 v1.0 source + 2 v1.0 test files)

## Sliders Shipped

| Component           | Mode          | Width            | Form      | Mutations                                              |
| ------------------- | ------------- | ---------------- | --------- | ------------------------------------------------------ |
| `TransactionSlider` | create / edit | w-screen / 480px | RHF + Zod | POST / PATCH + DELETE with AlertDialog                 |
| `CategorySlider`    | create / edit | w-screen / 480px | RHF + Zod | POST /categories + POST /categories/:id/limits (SCD-2) |

## Composition Confirmation

### transactionsByCatId / draftsByCatId from hooks (NOT props)

```typescript
const transactionsByCatId = useMemo(() => {
  const m = new Map<string, TxnDTO[]>();
  for (const t of txns.data ?? []) { ... }
  // Newest first
  for (const list of m.values()) { list.sort(...) }
  return m;
}, [txns.data]);
```

Both Maps derive from `useTransactions(...).data` and `useDrafts(...).data`. Props seed `initialData` for hydration; live mutations update the hooks; the Maps update automatically.

### AddCategoryColumn outside SortableContext

```tsx
<DndContext ...>
  <div className="flex gap-2">
    <SortableContext items={localCategoryOrder.map(c => c.id)} ...>
      {localCategoryOrder.map(c => <CategoryColumn ... />)}
    </SortableContext>
    {/* Sibling, NOT inside items list — does NOT call useSortable */}
    <AddCategoryColumn onClick={...} />
  </div>
</DndContext>
```

`AddCategoryColumn` component has no `useSortable` call. Test asserts `data-sortable-id` is null on the add column element.

## RSC Rewrite Confirmation

4 parallel `serverApiFetch` calls; `budgetTz` from spendings-summary response:

```typescript
const [categoriesRes, txnsRes, draftsRes, summaryRes] = await Promise.all([
  serverApiFetch(budgetId, `/budgets/${budgetId}/categories`),
  serverApiFetch(
    budgetId,
    `/budgets/${budgetId}/transactions?month=${month}&confirmed=true`,
  ),
  serverApiFetch(
    budgetId,
    `/budgets/${budgetId}/transactions?month=${month}&confirmed=false`,
  ),
  serverApiFetch(
    budgetId,
    `/budgets/${budgetId}/spendings-summary?month=${month}`,
  ),
]);
```

No `/budgets/:id` fetch. `budgetCurrency` and `budgetTz` read from `summaryRes` (Plan 04-02 extended DTO). ?month validated with regex `/^\d{4}-\d{2}$/` (T-04-04-01 mitigation).

## v1.0 Deletions (3 source + 2 test files)

| File                                | Reason                                                        |
| ----------------------------------- | ------------------------------------------------------------- |
| `transaction-capture-form.tsx`      | Fields extracted in Plan 04-01; replaced by TransactionSlider |
| `transaction-capture-sheet.tsx`     | Sheet wrapper for deleted form; superseded                    |
| `transaction-edit-form.tsx`         | Edit path replaced by TransactionSlider edit mode             |
| `transaction-capture-form.test.tsx` | Tests for deleted component                                   |
| `transaction-edit-form.test.tsx`    | Tests for deleted component                                   |

Grep confirmed: zero remaining importers after deletion.

## Docker Build

Web image rebuilt and restarted via `docker compose build web && make restart-web`. RSC page at `/en/budgets/<id>/spendings` renders the grid.

## Test Counts

| File                                                            | Tests  | Key assertions                                                          |
| --------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `test/components/budgeting/transaction-slider.test.tsx`         | 9      | create/edit headers, delete AlertDialog, FX line, field labels          |
| `test/components/budgeting/category-slider.test.tsx`            | 7      | create/edit headers, icon/color pickers (8 each), currency badge        |
| `test/components/spendings-grid/category-column.test.tsx`       | 7      | useSortable attributes on root, grip listener spread, rows ordered      |
| `test/components/spendings-grid/spendings-grid-client.test.tsx` | 9      | DndContext, SortableContext, AddCategoryColumn outside items, hydration |
| **New total**                                                   | **32** |                                                                         |

Pre-existing test failures (unchanged): `bulk-action-bar`, `edit-history-panel`, `pending-drafts-inbox`, `transaction-search-bar` — from Plan 04-01 deletions.

## Task Commits

1. **Task 1: TransactionSlider + CategorySlider** — `b6baef8`
2. **Task 2: CategoryColumn + SpendingsGridClient + RSC page** — `540dc02`
3. **Task 3: Delete v1.0 forms** — `24376a3`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exactOptionalPropertyTypes: dragGripProps undefined**

- **Found during:** Task 2 typecheck
- **Issue:** `useSortable().listeners` returns `SyntheticListenerMap | undefined`; `ColumnHeader.dragGripProps: Record<string, unknown>` does not accept undefined
- **Fix:** `dragGripProps={listeners ?? {}}` in CategoryColumn
- **Files modified:** category-column.tsx
- **Committed in:** 540dc02

**2. [Rule 1 - Bug] exactOptionalPropertyTypes: TransactionSlider/CategorySlider initial prop**

- **Found during:** Task 2 typecheck
- **Issue:** Passing `initial={undefined}` via conditional violates exactOptionalPropertyTypes
- **Fix:** Conditional spread `{...(editTxnInitial ? { initial: editTxnInitial } : {})}` and `{...(catSlider.mode === "edit" && editCatInitial ? { initial: editCatInitial } : {})}`
- **Files modified:** spendings-grid-client.tsx
- **Committed in:** 540dc02

**3. [Rule 2 - Missing functionality] Test files for deleted forms not in plan**

- **Found during:** Task 3 grep + test run
- **Issue:** `transaction-capture-form.test.tsx` and `transaction-edit-form.test.tsx` import deleted files; they fail with import errors after source deletion
- **Fix:** Deleted both test files (per plan spirit — v1.0 tests for v1.0 forms)
- **Files deleted:** 2 test files
- **Committed in:** 24376a3

### Pre-existing Issues (out of scope, logged)

- `recurring/actions.ts:9` imports deleted `pending-drafts-inbox` — pre-existing from Plan 04-01. Out of scope.
- 4 test files (`bulk-action-bar`, `edit-history-panel`, `pending-drafts-inbox`, `transaction-search-bar`) import deleted components — pre-existing from Plan 04-01. Out of scope.

## Known Stubs

None — all components are fully wired to hooks. TransactionSlider and CategorySlider make real API calls. RSC page fetches real endpoints. SpendingsGridClient wires all 9 hooks from Plan 04-03.

## Threat Flags

None. All threat model mitigations implemented:

- T-04-04-01: `?month` regex validation in RSC page
- T-04-04-04: `touch-action: none` on grip handle only; TouchSensor `delay: 200, tolerance: 8`
- T-04-04-06: React JSX auto-escaping for user-provided strings
- T-04-04-07: `serverApiFetch(budgetId, ...)` sets X-Budget-ID on all 4 RSC fetches
- T-04-04-08: AlertDialog confirmation before DELETE transaction

---

_Phase: 04-spendings-grid_
_Completed: 2026-05-13_
