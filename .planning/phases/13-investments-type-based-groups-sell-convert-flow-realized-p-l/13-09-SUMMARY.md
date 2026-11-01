---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 09
subsystem: web
tags: [type-groups, hooks, section]
key-files:
  created:
    - apps/web/src/hooks/use-type-summary.ts
    - apps/web/test/investments/investments-section-type-blocks.test.tsx
  modified:
    - apps/web/src/components/budgeting/wallets-tab/investments-section.tsx
    - apps/web/src/hooks/use-create-holding.ts
    - apps/web/src/hooks/use-update-holding.ts
requirements-completed: [D-13, D-14, D-15, D-16]
---

# 13-09 Summary: Type blocks in the web

- `useTypeSummary` / `useSetTypeOrder` (optimistic order, clientApiWrite, rollback + toast) + `typeSummaryKey`. Create/update holding also invalidate the type summary and `["budget", id, "overview"]`.
- Section rewritten around `buildTypeBlocks(holdings, summary.order)`: one `InvestmentTypeHeader` per held type (`typeGroupPL` with that type's realized/sold cost), rows in a per-block SortableContext; hidden types' realized shown under the section total (`investments-total-realized`). Collapse per type in localStorage (`inv-type-<budget>-<type>`), **expanded by default** (every type now has a header; collapsed-by-default would hide everything).
- Old flat-list DnD, join bands, group headers and `committed` override removed from the render path; DndContext kept with no handlers (drag lands in 13-10). `HoldingSheet` gets `groups={[]}` until 13-10 removes the prop.

## Verification
Section test 5/0 (incl. useSetTypeOrder rollback on 422); web investments + components 1435 pass / 0 fail; tsc + eslint clean. NOT deployed (interim rule — 13-10 rebuilds web).

## Deviations
- Default expanded (was collapsed for custom groups) — reasoned above.

## Self-Check: PASSED
