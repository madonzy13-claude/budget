---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 06
subsystem: investments-adapters, api
tags: [search, stocks, rebuild]
key-files:
  modified:
    - packages/investments/src/adapters/persistence/instrument-repo.ts
    - packages/investments/test/adapters/instrument-repo.test.ts
    - apps/api/test/routes/investments.test.ts
    - scripts/provision-uat-investments.ts
requirements-completed: [D-10, D-11]
---

# 13-06 Summary: stocks search + live api

- `search(q, limit, "stocks")` → `asset_class IN ('equities','etf')` (bound flag, fixed literal list, no sql.raw); other classes keep equality.
- Route cases: POST stocks → stocks; POST legacy equity → stocks; GET has `typeWeights` + compat `groupWeights`/`group`.
- UAT provisioning seeds `stocks`.
- `make build-api` + `make build-worker`: api recreated 05:46:12Z healthy, worker 05:46:27Z; served bundle contains `normalizeLegacyUiType`; `/api/health` 200. Closes the 13-03 interim CHECK window for API writes (the old web bundle sends `equity`, now normalized server-side).

## Verification
instrument-repo 11/0 (real PG); investments routes 8/0 (route cases passed on first run — RED for them was 13-05's contract test).

## Deviations
None.

## Self-Check: PASSED
