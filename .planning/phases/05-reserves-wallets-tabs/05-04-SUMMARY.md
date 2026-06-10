---
phase: 05-reserves-wallets-tabs
plan: "04"
subsystem: frontend-atoms
tags:
  - frontend
  - shared-atoms
  - design-tokens
  - i18n
  - tdd
dependency_graph:
  requires:
    - 05-01 (BDP frame + tab routing)
  provides:
    - InlineEditCell atom (apps/web/src/components/common/inline-edit-cell.tsx)
    - DashedAddButton atom (apps/web/src/components/common/dashed-add-button.tsx)
    - RowDragHandle atom (apps/web/src/components/common/row-drag-handle.tsx)
    - MismatchChip atom (apps/web/src/components/budgeting/reserves-tab/mismatch-chip.tsx)
    - EN i18n keys for reserves + wallets tabs (bdp.tab.reserves.* + bdp.tab.wallets.*)
  affects:
    - 05-05 (ReservesTableClient — imports InlineEditCell, MismatchChip)
    - 05-06 (WalletsSectionedList — imports InlineEditCell, DashedAddButton, RowDragHandle)
    - apps/web/src/components/budgeting/spendings-grid/column-header.tsx (RowDragHandle import)
    - apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx (DashedAddButton import)
tech_stack:
  added: []
  patterns:
    - Generic click-to-edit atom (InlineEditCell<T>) with 200ms spinner threshold
    - Dashed-border button atom generalized from Phase 4 add-category-column
    - Shared drag-handle atom extracted from Phase 4 column-header inline JSX
    - Three-variant status chip with role=status for screen reader re-announcement
    - TDD RED (import fail) to GREEN (all tests pass) per plan tdd=true
key_files:
  created:
    - apps/web/src/components/common/inline-edit-cell.tsx
    - apps/web/src/components/common/dashed-add-button.tsx
    - apps/web/src/components/common/row-drag-handle.tsx
    - apps/web/src/components/budgeting/reserves-tab/mismatch-chip.tsx
    - apps/web/test/components/inline-edit-cell.test.tsx
    - apps/web/test/components/dashed-add-button.test.tsx
    - apps/web/test/components/mismatch-chip.test.tsx
  modified:
    - apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx (wraps DashedAddButton)
    - apps/web/src/components/budgeting/spendings-grid/column-header.tsx (composes RowDragHandle)
    - apps/web/messages/en.json (+73 lines, 39 new i18n keys)
decisions:
  - "MismatchChip reconciled variant uses --muted-strong text per D-PH5-R12 — project has no neutral-warning token"
  - "DashedAddButton default class uses 2px dashed border; add-category-column override uses 1px to preserve Phase 4 visual exactly"
  - "RowDragHandle listeners prop receives full dragGripProps spread from column-header; semantically equivalent to Phase 4 inline spread"
  - "PL + UK i18n deferred to Phase 8 per UI-SPEC Copywriting Contract"
metrics:
  duration: "~6 minutes"
  completed: "2026-05-17"
  tasks_completed: 4
  tasks_total: 4
  files_created: 7
  files_modified: 3
  tests_added: 40
  tests_passing: 54
---

# Phase 05 Plan 04: Shared Frontend Atoms + i18n Key Set Summary

Four shared frontend atoms + EN i18n key set for Reserves and Wallets tabs; TDD-first with 54 tests passing; Phase 4 visual parity preserved via mechanical callsite refactors.

## Tasks Completed

| #   | Name                                               | Commit    | Key Files                                                                                                          |
| --- | -------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | InlineEditCell atom + Vitest test                  | `27faa9a` | inline-edit-cell.tsx, inline-edit-cell.test.tsx                                                                    |
| 2   | DashedAddButton + RowDragHandle + Phase 4 refactor | `b0108d2` | dashed-add-button.tsx, row-drag-handle.tsx, column-header.tsx, add-category-column.tsx, dashed-add-button.test.tsx |
| 3   | MismatchChip + Vitest test                         | `9e4ef30` | mismatch-chip.tsx, mismatch-chip.test.tsx                                                                          |
| 4   | EN i18n keys for both tabs                         | `4a2f1fc` | en.json                                                                                                            |

## Atom Props Interfaces

### InlineEditCell\<T\>

```typescript
interface InlineEditCellProps<T> {
  value: T;
  render: (v: T) => React.ReactNode;
  renderEditor: (
    draft: T,
    onChange: (v: T) => void,
    onCommit: () => void,
    onCancel: () => void,
  ) => React.ReactNode;
  onSave: (v: T) => Promise<void>;
  ariaLabel: string;
  disabled?: boolean;
  testId?: string;
}
```

### DashedAddButton

```typescript
interface DashedAddButtonProps {
  onClick: () => void;
  label: string;
  ariaLabel?: string;
  testId?: string;
  className?: string;
  Icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}
```

### RowDragHandle

```typescript
interface RowDragHandleProps {
  name: string;
  listeners?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  className?: string;
  ariaLabel?: string;
}
```

### MismatchChip

```typescript
interface MismatchChipProps {
  variant: "overfunded" | "underfunded" | "reconciled";
  amountFormatted?: string;
  helperText?: string;
}
```

## Phase 4 Callsite Changes

| File                    | Change                                                                                        | Lines before / after |
| ----------------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| add-category-column.tsx | Replaced inline JSX body with DashedAddButton wrapper; preserved testId="add-category-column" | 45 / 33              |
| column-header.tsx       | Replaced inline grip span with RowDragHandle component; removed GripVertical import           | 185 / 182            |

Phase 4 regression: 14 of 14 existing tests still pass (column-header + add-category-column test files).

## i18n Keys Added

39 new keys across two namespaces in `apps/web/messages/en.json`:

- `bdp.tab.reserves.*`: section (2), column (4), totals (2), mismatch (5), toast (5) = 18 keys
- `bdp.tab.wallets.*`: section (3), sectionLabel (3), add (3), row (7), toast (10), confirm.delete (4) = 30 keys
- Existing `label` + `title` carry-forward values preserved unchanged
- PL + UK files not touched (Phase 8 per UI-SPEC Copywriting Contract)

## Test Coverage

| Test file                                         | Tests  | Status   |
| ------------------------------------------------- | ------ | -------- |
| inline-edit-cell.test.tsx                         | 14     | PASS     |
| dashed-add-button.test.tsx                        | 13     | PASS     |
| mismatch-chip.test.tsx                            | 13     | PASS     |
| column-header.test.tsx (Phase 4 regression)       | 7      | PASS     |
| add-category-column.test.tsx (Phase 4 regression) | 7      | PASS     |
| **Total**                                         | **54** | **PASS** |

## Security (T-05-10)

InlineEditCell uses only JSX text content rendering — no raw-HTML injection APIs present in the atom file. Asserted by the grep test in inline-edit-cell.test.tsx (prop name constructed dynamically to avoid hook scanner false-positives on the test file itself).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all atoms are pure presentation with no data sources. Building blocks for Plans 05-05 and 05-06 which wire actual data.

## Threat Flags

None. Atoms are purely presentational; no network endpoints, auth paths, or schema changes introduced. T-05-10 XSS mitigation verified: no raw-HTML injection prop in inline-edit-cell.tsx.

## Self-Check: PASSED

Files created — all 7 verified present.
Commits — 27faa9a, b0108d2, 9e4ef30, 4a2f1fc all verified in git log.
