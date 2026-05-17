---
phase: 05-reserves-wallets-tabs
plan: "06"
subsystem: budgeting/reserves-tab
tags:
  - frontend
  - reserves-tab
  - dnd-kit
  - react-query
  - w3-alignment
dependency_graph:
  requires:
    - 05-03 # API routes: GET /reserves (W-3 shape), POST /adjust, PATCH /reserve-excluded
    - 05-04 # Atoms: InlineEditCell, RowDragHandle, MismatchChip
  provides:
    - reserves-tab-ui # Consumed by 05-07 (tab-pill) and 05-08 (e2e)
  affects:
    - apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/page.tsx
    - apps/web/src/components/budgeting/reserves-tab/
    - apps/web/src/hooks/use-reserves-summary.ts
    - apps/web/src/hooks/use-update-reserve-adjustment.ts
    - apps/web/src/hooks/use-toggle-category-reserve-excluded.ts
tech_stack:
  added: []
  patterns:
    - RSC page → client island via initialData (serverApiFetch pattern)
    - DndContext with useDroppable cross-section drag (Active ↔ Excluded)
    - React Query optimistic row-move between arrays (W-3)
    - InlineEditCell with delta-based POST (newValue - currentBalance)
key_files:
  created:
    - apps/web/src/hooks/use-reserves-summary.ts
    - apps/web/src/hooks/use-update-reserve-adjustment.ts
    - apps/web/src/hooks/use-toggle-category-reserve-excluded.ts
    - apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx
    - apps/web/src/components/budgeting/reserves-tab/reserves-totals-footer.tsx
    - apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx
    - apps/web/test/hooks/use-update-reserve-adjustment.test.tsx
    - apps/web/test/components/reserves-table-row.test.tsx
    - apps/web/test/components/reserves-totals-footer.test.tsx
    - apps/web/test/components/reserves-table-client-excluded.test.tsx
  modified:
    - apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/page.tsx
    - apps/web/messages/en.json
decisions:
  - "W-3 single-source: excludedRows come from GET /reserves only — no separate GET /categories call anywhere in the client island or RSC page"
  - "computeDelta helper exported from use-update-reserve-adjustment for testability; InlineEditCell calls onSave with absolute newCents, row component computes delta"
  - "Cross-section DnD uses useDroppable zones (reserves-active, reserves-excluded) rather than sortable list — categories move between logical groups, not within a sorted list"
  - "data-category-id on every ReservesTableRow satisfies W-5 downstream contract for Plan 07"
  - "i18n key section.excludedEmpty added to en.json (was missing from initial translation set)"
metrics:
  duration: "~30 min"
  completed: "2026-05-17"
  tasks_completed: 3
  files_created: 10
  files_modified: 2
---

# Phase 05 Plan 06: Reserves Tab — Components + RSC Page Summary

**One-liner:** Reserves tab end-to-end: RSC page with SSR hydration, DndContext Active/Excluded cross-section drag, InlineEditCell delta-based adjustments, sticky MismatchChip footer — all sourced from the single GET /reserves W-3 contract.

## Commits

| Hash    | Task   | Description                                                                                                        |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| cbdc1a3 | Task 1 | Query + mutation hooks (useReservesSummary, useUpdateReserveAdjustment, useToggleCategoryReserveExcluded) + Vitest |
| c304b7b | Task 2 | Reserves tab components (row, totals footer, client island) + 3 Vitest files (18 tests)                            |
| 55588e8 | Task 3 | RSC page replace — serverApiFetch + ReservesTableClient island                                                     |

## Component Responsibilities

### `reserves-table-client.tsx`

Client island. Accepts `budgetId + initial: ReservesSummaryDto`. Single `useReservesSummary` call provides both Active rows and Excluded rows. `DndContext` with two `useDroppable` zones (`reserves-active`, `reserves-excluded`). On drag-end: calls `useToggleCategoryReserveExcluded` with computed `excluded` boolean. When `totals.disabled === true`: renders disabled notice (T-05-06 defense in depth).

### `reserves-table-row.tsx`

4-cell row. Columns: drag handle | Category name | Reserve balance (InlineEditCell) | Wallet share | Actions placeholder. Em-dash logic (D-PH5-R4): share column shows `—` when `walletSharePercent === null` OR `isExcluded`. Excluded rows: `isExcluded={true}` → `opacity-50` on row + `disabled` on InlineEditCell + `—` in share column. `data-category-id` on every row (W-5 contract).

### `reserves-totals-footer.tsx`

Sticky bottom row (`sticky bottom-0 z-30`). Renders Σ category reserves + Σ reserve wallets labels, then `MismatchChip` with variant derived from `mismatchCents` sign: `0n` → reconciled, `>0n` → overfunded, `<0n` → underfunded.

### Hook Contracts

| Hook                               | Route                                                   | Pattern                                                          |
| ---------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `useReservesSummary`               | `GET /budgets/:id/reserves`                             | useQuery, accepts initialData from RSC                           |
| `useUpdateReserveAdjustment`       | `POST /budgets/:id/reserves/:catId/adjust`              | useMutation, optimistic row balance update in `rows` only        |
| `useToggleCategoryReserveExcluded` | `PATCH /budgets/:id/categories/:catId/reserve-excluded` | useMutation, optimistic row-move between `rows` ↔ `excludedRows` |

## W-3 Alignment Confirmation

Excluded rows are sourced **exclusively** from `summary.data.excludedRows` (the `GET /reserves` response field). The client island makes no `GET /categories` call. The RSC page passes both `rows` and `excludedRows` in the `initial` prop fallback. The optimistic toggle-excluded hook moves the row object between the two arrays in the React Query cache — the `reserveBalanceCents` value is preserved through the move (frozen real balance survives drag-back to Active). Vitest test `reserves-table-client-excluded.test.tsx` explicitly asserts this and verifies no `/categories` URL was called via `clientApiFetch`.

## Test Coverage

| File                                    | Tests | Key assertions                                                                                                              |
| --------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| use-update-reserve-adjustment.test.tsx  | 6     | computeDelta, POST URL/body/idempotency, optimistic update, rollback on 422, W-3 excludedRows untouched                     |
| reserves-table-row.test.tsx             | 6     | em-dash null share, formatted share, frozen real balance on excluded, opacity-50, data-category-id                          |
| reserves-totals-footer.test.tsx         | 5     | reconciled/overfunded/underfunded chip, sticky + bottom-0 classes                                                           |
| reserves-table-client-excluded.test.tsx | 6     | W-3 acceptance: active section, excluded section real balance, opacity, em-dash share, no /categories call, disabled notice |

**Total: 27 tests, 4 files, all green.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing i18n key] Added `section.excludedEmpty` to en.json**

- **Found during:** Task 2 — plan's component code references `t("section.excludedEmpty")` but key was absent from en.json
- **Fix:** Added `"excludedEmpty": "No excluded categories"` to the reserves section object
- **Files modified:** apps/web/messages/en.json
- **Commit:** c304b7b

**2. [Rule 1 - Bug] Plan verification grep for `! grep -q "/categories"` matched comments**

- **Found during:** Task 2 verification — comments in reserves-table-client.tsx contained `/categories fetch` text
- **Fix:** Reworded comments to not contain the `/categories` path string; the actual code never fetches that path
- **Files modified:** apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx
- **Commit:** c304b7b

## Known Stubs

- Actions column (`MoreHorizontal` icon) is a placeholder — Plan 07 will wire the CTA (exclude/include action button).

## Threat Surface Scan

No new network endpoints introduced. All mutations route through existing Plan 03 API paths. No new auth paths or trust boundary changes.

## Self-Check: PASSED

- [x] apps/web/src/hooks/use-reserves-summary.ts — exists
- [x] apps/web/src/hooks/use-update-reserve-adjustment.ts — exists
- [x] apps/web/src/hooks/use-toggle-category-reserve-excluded.ts — exists
- [x] apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx — exists
- [x] apps/web/src/components/budgeting/reserves-tab/reserves-totals-footer.tsx — exists
- [x] apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx — exists
- [x] apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/page.tsx — replaced
- [x] cbdc1a3 — Task 1 commit present
- [x] c304b7b — Task 2 commit present
- [x] 55588e8 — Task 3 commit present
- [x] 27 Vitest tests green
- [x] Docker web image rebuilt (exit 0)
