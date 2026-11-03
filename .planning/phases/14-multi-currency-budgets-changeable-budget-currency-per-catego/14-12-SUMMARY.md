---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 12
subsystem: budgeting
tags: [reserves, settlement, tasks, d-11, d-12, d-13, d-14, d-15, d-16]
key-files:
  created:
    - packages/budgeting/test/reserves/reserve-settlement-task.test.ts
  modified:
    - packages/budgeting/src/ports/reserves-summary-repo.ts
    - packages/budgeting/src/adapters/persistence/reserves-summary-repo.ts
    - packages/budgeting/src/ports/reserve-event-loader-repo.ts
    - packages/budgeting/src/adapters/persistence/reserve-event-loader-repo.ts
    - packages/budgeting/src/application/get-reserve-positions.ts
    - packages/budgeting/src/application/recompute-reserve-topup-task.ts
    - packages/budgeting/src/ports/task-repo.ts
    - packages/budgeting/test/reserves/currency-fixture.ts
    - packages/budgeting/test/adapters/category-reserve-adjustments-repo.test.ts
requirements-completed: [D-11, D-12, D-13, D-14, D-15, D-16]
---

# 14-12 Summary: per-currency reserve settlement + task lines

- `reserveWalletsByCurrency` replaces `sumReserveWalletAmounts` (GROUP BY currency; negative balances count 0 but their currency is listed). Its only caller was the loader; the old method is removed and its repo test migrated.
- Loader returns `walletsByCurrency`, `reserveWalletCurrencies`, `todayRates` (both directions, every reserve/wallet currency ↔ budget, at today in budget tz) and a userDefined total converted at today.
- get-reserve-positions: `settleReserveByCurrency(engine.internalByCurrency, wallets, …)`; `surplusCents = settlement.netBudgetCents`, `internalCents` = need converted at today; adds `walletsByCurrency`, `settlement`. In-memory loaders without a wallet breakdown keep the engine surplus.
- RESERVE_TOPUP: resolves only when `settlement.direction === null` and no lines (exact, D-13); payload keeps the legacy trio (net, budget ccy) and adds `lines[{currency, shortfall_cents, direction, equiv?}]`.

## Verification
- RED (8e2c6c78): D-14 case "Expected: not 20000n" — received 20000n (raw cross-currency sum); D-15/D-12/single-ccy payloads lacked lines. D-13 case passed already (exact before and after).
- GREEN: reserves + tasks + summary-repo test → 58/0. packages/budgeting/test + apps/api/test/routes → 1471 pass / 1 fail; the fail (`/scheduled-payments > POST in a foreign currency back-fills…`) is in the pre-phase baseline fail list.
- tsc budgeting + api clean; eslint clean; `surplus === 0n` gone from the task.

## Deviations
- Today's rates come from the loader (adapter) instead of injecting the FX port into get-reserve-positions — no new wiring at the 6 construction sites.

## Self-Check: PASSED
