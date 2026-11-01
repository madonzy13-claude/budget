---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 07
subsystem: investments, api
tags: [sell, history, booking, overview, tdd]
key-files:
  created:
    - packages/investments/src/ports/history-repo.ts
    - packages/investments/src/adapters/persistence/history-repo.ts
    - packages/investments/src/application/sell-holding.ts
    - packages/investments/test/application/sell-holding.test.ts
    - apps/api/test/routes/investments-history.test.ts
  modified:
    - packages/investments/src/adapters/persistence/holding-repo.ts
    - packages/investments/src/application/create-holding.ts
    - packages/investments/src/domain/holding.ts
    - packages/investments/src/domain/contributions.ts
    - packages/investments/src/contracts/api.ts
    - packages/investments/src/contracts/factory.ts
    - packages/investments/package.json
    - apps/api/src/routes/investments.ts
    - apps/api/src/boot.ts
    - apps/worker/src/worker.ts
    - apps/api/test/routes/investments.test.ts
requirements-completed: [D-01, D-02, D-04, D-06, D-07, D-08, D-17, D-18, D-19, D-20]
---

# 13-07 Summary: Sell on the server

- `HistoryRepo` port (+ `entry()` defaults helper) and `DrizzleHistoryRepo.commit`: ONE withTenantTx — new holding (`insertHoldingTx`, now the only INSERT), patches scoped `id AND budget_id` (miss → not_found → rollback), one transfer uuid for conversion legs, entries. `listFlows` (live rows, flow-0 included).
- `holdingShape()` / `isQuantityHolding()`: quantity (stocks/crypto/metals or qty≠1) · amount · deposit.
- `sellHolding`: value on the sale date (deposit accrual as of that date; metals price re-denominated like list-holdings), booking via 13-01 math, both FX legs at the sale date, `withdraw` (flow −received) vs `convert_out`+`convert_in` (flow 0, shared transfer). Destination new (amount / quantity / deposit) or existing (merge or buyMore, same-currency only). Errors: not_found, fx_unavailable{currency,date}, keep_out_of_range, sell_qty_out_of_range, left_shape_mismatch, currency_mismatch, same_holding, unsupported_destination (deposit target), quantity_required. Sell-all → quantity/cost 0 + archived, so undo is delta-exact.
- `createHolding`: holdings with a buy price commit holding + first entry (`buy`/`add`, `openedOn` default today UTC, flow = cost, valueDelta = value for amount holdings). `toNewHolding` extracted and reused by Sell → New.
- Route `POST /:id/sell` → `{ ok, archived, newHoldingId, transferId }`.
- boot.ts: historyRepo into the module; `getOverviewWealth.contributionsHistory` = `makeContributionsReader(listFlows, ccy, fxProvider.rateAsOf)` (D-08 hybrid live). Worker module also gets historyRepo.
- Contributions reader skips zero flows (no FX lookup for a currency-less flow-0 row).

## Verification
- Unit: sell-holding 15/0 (all CONTEXT fixtures incl. D-20, D-18 date freeze); investments domain/application/contracts 130/0.
- Real PG: investments-history 15 + investments 8 → 18/0 in the combined run shown (repo atomicity, cross-tenant 404s, deposit partial, flow sum unchanged by conversion, mid-commit failure leaves nothing).
- api + worker rebuilt (05:57:46Z / 05:58:03Z, healthy); served routes file contains `/:id/sell`. Unauthenticated curl returns 401 for any path (auth runs before routing), so the bundle grep is the proof.

## Deviations
- TDD order: adapter (task 1) and route (task 3) were written before their integration tests ran; the use-case (task 2) had a proper RED commit. All tests were run red→green per file where practical; recorded honestly.
- `insertHoldingTx` returns the mapped `Holding` (not just the id) so `create()` keeps its return shape.
- `listFlows` uses the system user id (`…0001`, same as budgeting snapshot/task repos) since the Overview read has no acting user.
- Added package export subpaths for the new modules (`history-repo`, `history-schema`, `contributions`, `sell-booking`).

## Self-Check: PASSED
