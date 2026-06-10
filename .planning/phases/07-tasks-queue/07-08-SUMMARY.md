---
phase: 07
plan: 08
subsystem: budgeting-tasks-frontend
tags:
  - frontend
  - i18n
  - tasks
  - reserves
  - phase-7
requirements: [TASK-07, TASK-08]
requires:
  - 07-07-PLAN (CUSHION_BELOW_TARGET kind exists at server boundary)
  - 03-06-PLAN (TaskBannerRow shell + 60s poll already wired)
  - 05-T3-PLAN (ReservesTableRow shape, InlineEditCell trigger path)
provides:
  - TaskBannerRow with per-kind action routing (D-PH7-25)
  - ReservesTableRow.pendingTaskId prop + PencilLine indicator (D-PH7-26)
  - i18n catalogs (EN/PL/UK) for Phase 7 task strings + cushion settings keys
affects:
  - apps/web/src/components/budgeting/task-banner-row.tsx
  - apps/web/src/components/budgeting/task-banner.tsx
  - apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx
  - apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx
  - apps/web/messages/en.json
  - apps/web/messages/pl.json
  - apps/web/messages/uk.json
  - apps/web/test/components/budgeting/task-banner-row.test.tsx (new)
  - apps/web/test/components/budgeting/task-banner.test.tsx (fixture update)
tech-stack:
  added: []
  patterns:
    - vi.hoisted for shared spy refs across vi.mock factories
    - Intl.NumberFormat currency formatting inside the component (not in i18n
      catalog) so the same key works across locales without per-locale string
      duplication of the amount placeholder
    - DOM-level imperative click() into a data-testid'd InlineEditCell — avoids
      refactoring the cell with forwardRef while still wiring the PencilLine
key-files:
  created:
    - apps/web/test/components/budgeting/task-banner-row.test.tsx
  modified:
    - apps/web/src/components/budgeting/task-banner-row.tsx
    - apps/web/src/components/budgeting/task-banner.tsx
    - apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx
    - apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - apps/web/test/components/budgeting/task-banner.test.tsx
decisions:
  - "DOM lookup via querySelector(data-testid) for PencilLine -> InlineEditCell click
    instead of refactoring InlineEditCell to forwardRef + useImperativeHandle.
    Refactor is out of scope for Plan 07-08; the cell already exposes data-testid
    for Phase 5 Playwright coverage so the lookup is stable."
  - "Intl.NumberFormat lives inside the component (buildTitleParams) rather
    than embedded in the ICU placeholder so the same i18n key works for any
    locale without per-locale duplication of the amount placeholder shape."
  - "Reserves parent (reserves-table-client.tsx) gets a TODO comment for the
    pending-tasks subscription wiring; the row component prop ships now to
    unblock the deep-link landing UX in subsequent plans. RESERVE_TOPUP payload
    is budget-level (no per-category breakdown), so the eventual subscription
    marks every active reserve row when a pending task exists."
metrics:
  duration_minutes: 25
  completed: 2026-05-31
---

# Phase 7 Plan 08: Frontend Task Actions + i18n Summary

Enable disabled-from-Phase-3 task banner action buttons with per-kind routing
(deep-link navigation for RESERVE_TOPUP / CUSHION_BELOW_TARGET, inline POST for
CONFIRM_DRAFT with optimistic row collapse), add a visual pending-task indicator
to ReservesTableRow, ship 16 i18n keys to all 3 locales (EN/PL/UK), and remove
the Phase 3 `actionComingSoon` leftover.

## Tasks Completed

| Task | Name                                               | Commit  | Files                                                       |
| ---- | -------------------------------------------------- | ------- | ----------------------------------------------------------- |
| 1    | TaskBannerRow per-kind action routing              | d09ec32 | task-banner-row.tsx, task-banner.tsx, task-banner.test.tsx  |
| 2    | ReservesTableRow PencilLine pending-task indicator | aa02a0f | reserves-table-row.tsx, reserves-table-client.tsx           |
| 3    | i18n catalogs (EN/PL/UK)                           | 3b01f4b | apps/web/messages/{en,pl,uk}.json                           |
| 4    | Vitest coverage for TaskBannerRow                  | e7809af | apps/web/test/components/budgeting/task-banner-row.test.tsx |

## What Shipped

### Task 1 — TaskBannerRow

- `TaskKind` union narrowed: dropped `STALE_WALLET` + `MONTH_END_REVIEW`, added
  `CUSHION_BELOW_TARGET`. Final union is exactly the 3-kind set Phase 7 defines.
- Action button is enabled (no `disabled`, no `aria-disabled="true"`, no
  `actionComingSoon` tooltip — the Phase 3 "Coming in Phase 7" placeholder is
  gone everywhere).
- `onClick={handleAction}` dispatches by `task.kind`:
  - `RESERVE_TOPUP` → `router.push("/budgets/<id>/reserves?task=<id>")`
  - `CUSHION_BELOW_TARGET` → `router.push("/budgets/<id>/wallets?task=<id>#cushion")`
  - `CONFIRM_DRAFT` → `clientApiFetch("/recurring-rules/drafts/<draft_id>/confirm", { method: "POST", headers: { "X-Budget-ID": budgetId } })`
- CONFIRM_DRAFT pending state: button `disabled={true}` + `aria-busy="true"` +
  `<Loader2 className="h-3.5 w-3.5 animate-spin" />` swap for the label.
- CONFIRM_DRAFT success → `onResolved?.(task.id)` callback; parent
  (`task-banner.tsx`) removes the task from React-Query cache immediately and
  invalidates the query to fetch the canonical PENDING list.
- CONFIRM_DRAFT error → `toast.error(t("bdp.tasks.confirmError"))` from sonner.
- Title uses ICU placeholders (`{amount}`, `{ruleName}`, `{shortfall}`); amounts
  formatted via `Intl.NumberFormat` with `style: "currency"` from the payload's
  currency code. Payload values pass through `t(...)` interpolation only —
  never as raw JSX, preserving the Phase 3 T-03-06-03 invariant.
- Deep-link kinds (RESERVE_TOPUP, CUSHION_BELOW_TARGET) carry `aria-label` for
  screen reader navigation context.

### Task 2 — ReservesTableRow

- New optional prop `pendingTaskId?: string`.
- When set: renders a `<button>` containing a `PencilLine` (16px Lucide icon)
  inline with the category name, with `aria-label={tRoot("reserves.actions.editBalance")}`.
  Color: `text-[var(--muted)]` at rest, `hover:text-[var(--body-on-dark)]`.
- Click triggers the existing reserves-balance `InlineEditCell` via
  `document.querySelector('[data-testid="reserves-balance-<categoryId>"]').click()` —
  no new modal, no refactor of `InlineEditCell` (out of scope).
- When `pendingTaskId` is undefined: no extra DOM, existing Phase 5 layout
  preserved exactly (UAT-PH5-T3-55 carry-forward).
- Added `data-no-swipe` + `data-pending-task-id` + `data-testid` hooks for
  future Playwright coverage and to exclude the icon from the mobile swipe
  gesture.
- `reserves-table-client.tsx` got a TODO comment marking the parent wiring
  follow-up: subscribe to `["tasks", budgetId, "pending"]`, look up the
  RESERVE_TOPUP task if present, and pass `pendingTaskId` for every active
  reserve row (RESERVE_TOPUP payload is budget-level — no per-category
  breakdown — so the indicator paints across the active section when present).

### Task 3 — i18n catalogs

Added per locale (EN/PL/UK), under `bdp.tasks.*`:

- `title.{RESERVE_TOPUP|CONFIRM_DRAFT|CUSHION_BELOW_TARGET}` — ICU placeholders
  `{amount}`, `{ruleName}`, `{shortfall}` match payload field names from CONTEXT
  D-PH7-06 / D-PH7-12 / D-PH7-22.
- `kind.{RESERVE_TOPUP|CONFIRM_DRAFT|CUSHION_BELOW_TARGET}` — single-word chip
  labels.
- `action.{RESERVE_TOPUP|CONFIRM_DRAFT|CUSHION_BELOW_TARGET}.label` — button
  text.
- `action.{RESERVE_TOPUP|CUSHION_BELOW_TARGET}.ariaLabel` — screen reader
  context for deep-link kinds only.
- `confirmError` — sonner toast on CONFIRM_DRAFT failure.

Added under `settings.cushion.*`:

- `targetMonthsLabel` + `targetMonthsError` + `preview` + `previewMet` +
  `previewError` + `saved` — companion keys for the cushion target months
  setting introduced in Plan 09.

Added under `onboarding.cushion.*`:

- `targetMonthsLabel` + `targetMonthsError` — onboarding mirror.

Added under top-level `reserves.actions.*`:

- `editBalance` — aria-label for the Plan 07-08 PencilLine indicator.

Removed from all 3 locales:

- `bdp.tasks.actionComingSoon` (Phase 3 placeholder; the button is enabled now).

All 3 files validated by `python -m json.tool` (valid JSON).

### Task 4 — Vitest test

`apps/web/test/components/budgeting/task-banner-row.test.tsx` — 9 assertions:

1. Enabled state (no disabled, no aria-disabled, no Coming-soon tooltip).
2. RESERVE_TOPUP routing.
3. CUSHION_BELOW_TARGET routing.
4. CONFIRM_DRAFT POST + onResolved.
5. CONFIRM_DRAFT error toast.
6. CONFIRM_DRAFT pending state (disabled + aria-busy + Loader2 svg).
7. Intl.NumberFormat currency formatting in title.
8. T-07-08-01 sanitization (payload markup escaped by React).
9. Deep-link aria-label.

Mock spies provisioned via `vi.hoisted` — necessary because `vi.mock` factories
hoist above top-level decls, so a bare `const fetchMock = vi.fn()` referenced
inside a factory throws "Cannot access before initialization" at module init.

## Verification

```bash
cd apps/web && bun run test -- task-banner-row
# Test Files  1 passed (1)
# Tests       9 passed (9)

cd apps/web && bun run test -- task-banner reserves
# Test Files  5 passed (5)
# Tests       39 passed (39)
```

JSON validity (all 3 catalogs):

```bash
python3 -c "import json; [json.load(open(f)) for f in 'en pl uk'.split() for f in [f'apps/web/messages/{f}.json']]"
# OK on all 3
```

Key counts per locale:

```bash
for f in apps/web/messages/{en,pl,uk}.json; do
  grep -c CUSHION_BELOW_TARGET $f    # 3 per file (title + kind + action.label)
  grep -c targetMonthsLabel $f        # 2 per file (settings + onboarding)
  grep -c editBalance $f              # 1 per file
  grep -c actionComingSoon $f         # 0 per file (REMOVED)
done
```

## Deviations from Plan

None — plan executed exactly as written.

The plan offered a parent-wiring escape hatch ("If parent wiring is non-trivial,
ship just the row component prop and leave a TODO"). The reserves-table-client
file doesn't currently subscribe to the tasks query, so the row prop ships now
with the TODO comment per plan §"If parent wiring is non-trivial". This is the
plan's expected path, not a deviation.

## Authentication Gates

None encountered.

## Known Stubs

None. The PencilLine indicator on ReservesTableRow won't render until the
parent passes `pendingTaskId`; the prop is wired and the contract is honored.
The follow-up TODO in `reserves-table-client.tsx` is plan-documented as the
expected handoff for the deep-link landing UX in subsequent plans (per plan
§ Task 2 action), not a stub blocking this plan's goal.

The deep-link landing pages (`/budgets/<id>/reserves` and
`/budgets/<id>/wallets#cushion`) reading the `?task=<id>` query param to scroll
to the right row is out of scope for 07-08 per plan boundary; the routing
contract ships and the receiving pages are mountable as Phase 5 work.

## Verification Cross-Check (UI-SPEC § Modified in Phase 7)

| Truth                                                                                                            | Status   |
| ---------------------------------------------------------------------------------------------------------------- | -------- |
| TaskBannerRow action button enabled for all 3 kinds (no disabled, no aria-disabled, no actionComingSoon tooltip) | OK       |
| TaskKind union exactly RESERVE_TOPUP / CONFIRM_DRAFT / CUSHION_BELOW_TARGET                                      | OK       |
| RESERVE_TOPUP action button → router.push(/budgets/<id>/reserves?task=<id>)                                      | OK       |
| CUSHION_BELOW_TARGET action button → router.push(/budgets/<id>/wallets?task=<id>#cushion)                        | OK       |
| CONFIRM_DRAFT action button → clientApiFetch POST, optimistic row collapse on success, sonner toast on error     | OK       |
| Loading state (CONFIRM_DRAFT only): button disabled + Lucide Loader2 spinner + aria-busy                         | OK       |
| ReservesTableRow accepts optional pendingTaskId; renders PencilLine icon next to category name when set          | OK       |
| i18n keys added per UI-SPEC § Copywriting Contract (EN/PL/UK at landing)                                         | OK       |
| i18n key bdp.tasks.actionComingSoon removed from all 3 catalogs                                                  | OK       |
| Vitest component test for TaskBannerRow asserts per-kind action routing                                          | OK (9/9) |

## Self-Check: PASSED

- File `apps/web/src/components/budgeting/task-banner-row.tsx` — FOUND
- File `apps/web/src/components/budgeting/task-banner.tsx` — FOUND
- File `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx` — FOUND
- File `apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx` — FOUND
- File `apps/web/messages/en.json` — FOUND
- File `apps/web/messages/pl.json` — FOUND
- File `apps/web/messages/uk.json` — FOUND
- File `apps/web/test/components/budgeting/task-banner-row.test.tsx` — FOUND
- File `apps/web/test/components/budgeting/task-banner.test.tsx` — FOUND
- Commit d09ec32 (Task 1) — FOUND in git log
- Commit aa02a0f (Task 2) — FOUND in git log
- Commit 3b01f4b (Task 3) — FOUND in git log
- Commit e7809af (Task 4) — FOUND in git log
