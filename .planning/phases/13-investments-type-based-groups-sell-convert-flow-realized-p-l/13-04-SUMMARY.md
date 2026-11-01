---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 04
subsystem: web
tags: [i18n, types, type-groups, header]
key-files:
  created:
    - apps/web/src/lib/investment-type-groups.ts
    - apps/web/src/components/budgeting/wallets-tab/investment-type-header.tsx
    - apps/web/test/i18n/investments-phase13-keys.test.ts
    - apps/web/test/investments/investment-type-groups.test.ts
    - apps/web/test/investments/investment-type-header.test.tsx
  modified:
    - apps/web/messages/{en,pl,uk}.json
    - apps/web/src/lib/investment-types.ts
    - apps/web/src/lib/investment-icons.ts
    - apps/web/src/hooks/use-investments.ts
    - apps/web/src/hooks/use-create-holding.ts
    - apps/web/test/investments/investment-types.test.ts
requirements-completed: [D-10, D-13, D-14, D-15, D-16]
---

# 13-04 Summary: Web foundation for type groups

- 87 Phase 13 keys in EN/PL/UK with a parity + ICU-placeholder test.
- `UiType` now 11 investment types with `stocks` (holdingType equities, assetClass "stocks"); legacy equity/etf/reit → stocks, etb → treasury_bond in `deriveUiType`.
- `investment-type-groups.ts`: `buildTypeBlocks`, `typeGroupPL` (÷ lifetime cost, D-16 fixture = 53.7%), `portfolioPL` (hidden-type realized, BigInt sums), `moveTypeBlock`, `TypeSummaryDto`.
- `InvestmentTypeHeader`: value · total P/L + %, realized sub-line only when ≠ 0 (amount colored, words muted), tap value area → split; testids keep `investment-group-*`.
- `HoldingDto.costInBudgetCents` added (server already sends it).

## Deviations
- Type label key is `uitype.stocks` (existing labels live under `budget.investments.uitype.*`, not `types.*`). Header uses `t(\`uitype.${uiType}\`)`.
- No "Sold" history label: sales are stored as convert_out (new/existing) or withdraw (out), per plan.
- [Rule 3] `investment-icons.ts` (Record<UiType,…>) and the optimistic create row needed updating for the new UiType / DTO field.
- Number font class is `num` (no `font-num` in global.css).

## Verification
Full web Vitest 2690 pass / 0 fail; `tsc --noEmit` clean; eslint clean on touched files.

## Self-Check: PASSED
