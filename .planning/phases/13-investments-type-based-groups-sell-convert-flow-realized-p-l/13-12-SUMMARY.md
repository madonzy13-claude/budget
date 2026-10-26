---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 12
subsystem: investments, api
tags: [cleanup, groups, weights]
key-files:
  modified:
    - packages/investments/src/domain/holding.ts
    - packages/investments/src/domain/portfolio-metrics.ts
    - packages/investments/src/ports/holding-repo.ts
    - packages/investments/src/contracts/api.ts
    - packages/investments/src/application/{create-holding,update-holding,list-holdings}.ts
    - packages/investments/src/adapters/persistence/holding-repo.ts
    - apps/api/src/routes/investments.ts
    - packages/investments/test/** (Holding constructions, weights, contract)
    - apps/api/test/routes/investments.test.ts
requirements-completed: [D-10, ROADMAP-13.1]
---

# 13-12 Summary: Server is type-only

- `group` removed from Holding (positional param), NewHolding, createHoldingSchema (a stale client's `group` is stripped by Zod), EnrichedHoldingDto, use-cases, repo SQL (INSERT/UPDATE/SELECT/mapRow) and route serialization. `groupWeights` deleted.
- `portfolioWeights` = row's share within its type (`uiType ?? "other"`); `typeWeights` unchanged.
- `group_name` column stays in the DB + demo manifest (later drop avoids a half-removal aborting the demo refresh); UAT script still seeds it (harmless).

## Verification
investments domain/application/contracts 150/0 (RED commit first); route tests investments + history 27/0 on real PG; api/worker/web typecheck clean. api 10:46:42Z / worker 10:46:57Z rebuilt healthy; served list-holdings has no `groupWeights`.

## Deviations
None.

## Self-Check: PASSED
