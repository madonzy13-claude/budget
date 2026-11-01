---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 05
subsystem: investments-contracts
tags: [zod, ui-type, weights]
key-files:
  created:
    - packages/investments/test/contracts/api-ui-type-legacy.test.ts
  modified:
    - packages/investments/src/contracts/api.ts
    - packages/investments/src/domain/portfolio-metrics.ts
    - packages/investments/src/application/list-holdings.ts
    - packages/investments/test/domain/portfolio-weights.test.ts
requirements-completed: [D-10, D-11]
---

# 13-05 Summary: stocks contract + typeWeights

- `normalizeLegacyUiType` + `uiTypeSchema = z.preprocess(normalize, z.enum(UI_TYPES))`; `UI_TYPE_KEYS` (11, no possession); `UI_TYPE_TO_HOLDING_TYPE.stocks = "equities"`, legacy keys gone.
- `typeWeights` (key `uiType ?? "other"`) returned by listHoldings beside `groupWeights`. `group`, `groupWeights`, `weightPct` untouched (compat until 13-12).

## Verification
contracts 21/0; investments domain 83/0; investments + api tsc clean. The only red in `bun test packages/investments/test` is the instrument-repo integration test needing DATABASE_URL (env, pre-existing).

## Deviations
None.

## Self-Check: PASSED
