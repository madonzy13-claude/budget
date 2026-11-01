---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 10
subsystem: web
tags: [dnd, type-groups, holding-sheet, deploy]
key-files:
  created:
    - apps/web/test/investments/investments-section-dnd.test.tsx
  modified:
    - apps/web/src/components/budgeting/wallets-tab/investments-section.tsx
    - apps/web/src/components/budgeting/wallets-tab/INVESTMENTS-DND.md
    - apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx
    - apps/web/src/hooks/use-investments.ts
    - apps/web/src/hooks/use-create-holding.ts
    - apps/web/src/hooks/use-update-holding.ts
    - apps/web/test/investments/holding-sheet.test.tsx
    - apps/web/messages/{en,pl,uk}.json
    - apps/web/e2e/{features/investments-wallet.feature,steps/investments.steps.ts,page-objects/InvestmentsPo.ts}
  deleted:
    - apps/web/src/lib/investment-grouping.ts (+ test)
    - apps/web/src/components/budgeting/wallets-tab/group-combobox.tsx (+ test)
    - apps/web/src/components/budgeting/wallets-tab/investment-group-header.tsx (+ test)
requirements-completed: [D-10, D-12]
---

# 13-10 Summary: Type-block DnD, groups gone, deployed

- DnD: one DndContext; outer SortableContext of `type:<uiType>` blocks (handle in the header slot), inner per-block row contexts. Custom `collisionDetection` filters droppables by drag kind (block → blocks; row → rows of its own type) — without it the big block droppables win closestCenter for every row drag. Block drop → `moveTypeBlock` → `useSetTypeOrder`; row drop only within its type → arrayMove → `/reorder` with all blocks flattened. `committed` / `committedOrder` overrides prevent snap-back. Blocks collapse while one is dragged.
- INVESTMENTS-DND.md rewritten for the type-block model (kept: no onDragOver setState, Space guard, live recipe).
- Custom groups removed from the web: Group field, GroupCombobox, InvestmentGroupHeader, `group` on HoldingDto/hooks, dead i18n keys (group.portfolioSuffix/noGroups/create/metricsAria, field.group, ungroupZone, looseZone, uitype.equity/etf/etb/reit).
- Stocks & ETFs: picked instrument's `assetClass` sets holdingType (`etf` vs `equities`), uiType stays `stocks`.

## Verification
- Vitest: dnd 4/0 (RED commit first), holding-sheet 31/0; full web suite 2653 pass / 0 fail before the final sheet fix, then holding-sheet green.
- `make build-web`: version.json buildId `2026-10-25 17:19:09` → `2026-10-26 06:24:28`; the served wallets page chunk (`page-d3b8b2c135e8de32.js`, fetched over HTTPS) contains `investment-type-realized` and `type-order`.
- Live E2E on budget-dev (new scenario, real mouse input): "Dragging a type block saves the block order across a reload" — chromium + mobile (390px) 2/2 passed: crypto,broker → drag → broker,crypto → reload → broker,crypto.
- `@investments-wallet` chromium: 8 pass, 2 fail — the two old custom-group scenarios ("A group's expanded state persists", "Rows inside a group size their amounts…") which 13-14 migrates to type blocks.

## Deviations
- DnD unit test captures DndContext handlers (like wallets-sectioned-list.test.tsx) instead of driving the keyboard sensor: happy-dom has no layout, so sensor collisions are meaningless there. Real interaction is covered by the live E2E above.
- Live verification done as a durable E2E scenario rather than a throwaway Playwright session (Playwright MCP server failed to connect this session).

## Self-Check: PASSED
