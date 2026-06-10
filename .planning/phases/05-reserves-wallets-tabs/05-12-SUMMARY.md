---
phase: 05-reserves-wallets-tabs
plan: 12
subsystem: budgeting/reserves
tags: [reserves, replay-engine, application, wiring]
requires:
  - reserve-engine.ts (05-09, GREEN)
  - reserve-event-loader-repo (05-11)
  - 0030_phase05_reserve_model_reset (dropped VIEW + reserve_actual_cents)
provides:
  - get-reserve-positions replay orchestrator (event-loader → engine → positions)
  - ReservePositionsResult { positions, internalCents, userDefinedCents, surplusCents, direction }
  - ReservesSummaryDto NEW shape (reserve/used/overspent + internal/userDefined/surplus)
  - get-spendings-summary reserveUsed/overspent from engine cells
affects:
  - reserves read path (GET /budgets/:id/reserves), spendings grid header
tech-stack:
  added: []
  patterns: [replay-on-read, event-fold, pure-orchestrator]
key-files:
  created:
    - packages/budgeting/test/application/reserves-summary-builder.test.ts
  modified:
    - packages/budgeting/src/application/get-reserve-positions.ts
    - packages/budgeting/src/application/get-reserves-summary.ts
    - packages/budgeting/src/application/reserves-summary-builder.ts
    - packages/budgeting/src/application/get-spendings-summary.ts
    - packages/budgeting/src/application/recompute-reserve-topup-task.ts
    - packages/budgeting/src/application/adjust-category-reserve.ts
    - packages/budgeting/src/application/set-wallet-balance.ts
    - packages/budgeting/src/application/update-wallet.ts
    - packages/budgeting/src/adapters/persistence/categories-repo.ts
    - packages/budgeting/src/contracts/factory.ts
    - packages/budgeting/package.json
    - packages/budgeting/test/application/get-reserve-positions.test.ts
    - packages/budgeting/test/application/get-spendings-summary.test.ts
    - packages/budgeting/test/tasks/reserve-topup.test.ts
    - apps/api/src/boot.ts
decisions:
  - "Position usedCents derived from engine CELLS (Σ cell.used), not state.U — keeps decision-K disabled passthrough (used→0) consistent with display."
  - "recompute-reserve-topup reads surplusCents (= userDefined − internal); same number as the old wallet−reserves mismatch, same TOPUP/WITHDRAW sign."
  - "Mutation use-cases (adjust/set-wallet/update-wallet) build their post-mutation summary via the engine-derived getReservesSummary; legacy reserve_actual writes neutralised at the adapter (no-op). Full mutation rewrite is 05-13."
metrics:
  duration: ~31m
  completed: 2026-06-05
  tasks: 3
  files_changed: 16
---

# Phase 5 Plan 12: Reserve Replay Orchestrator + Consumers Summary

Rewired the reserves read path onto the pure reserve-engine: `get-reserve-positions` is now a thin replay orchestrator (event-loader → mapped `ReserveEngineEvent[]` → `reserveEngine` → per-category R/U/overspent + internal/userDefined/surplus/direction), and `get-reserves-summary` + `get-spendings-summary` consume it. The old accrued/funded/expected/real/VIEW model is deleted from all four files; the live reads no longer touch the dropped `category_reserve_balance` VIEW or `reserve_actual_cents` column.

## What was built

**Task 0 — replay orchestrator** (`get-reserve-positions.ts`):

- New dep shape `{ eventLoader, now? }` (dropped the 6 VIEW-derived repos).
- `mapInputsToEvents` (exported, test-pinned): walks months ASCENDING emitting `setLimit → cushion → spendDelta → accrual` (accrual for CLOSED months only, decision G), then `adjust` deltas in stored order (decision E), then `exclude`/`archive`, then `setUserDefined` last.
- Returns `ReservePositionsResult { positions: Map<id,{reserveCents,usedCents,overspentCents,byMonth}>, internalCents, userDefinedCents, surplusCents, direction }`. `direction = surplus<0?TOPUP:surplus>0?WITHDRAW:NONE`.
- Test rewritten with a fake `ReserveEventLoaderRepo`; golden final-row reproduction (G 130000 / H 80000 / internal 210000 / userDefined 300000 / surplus 90000 / WITHDRAW), TOPUP/NONE direction, decision-K disabled passthrough, exclude-from-internal, mapping-order assertions. (9 cases, green.)

**Task 1 — reserves summary reshape** (`get-reserves-summary.ts` + `reserves-summary-builder.ts`):

- `ReservesSummaryRow = {categoryId,name,reserveCents,usedCents,overspentCents}`; `totals = {internalCents,userDefinedCents,surplusCents,direction,disabled,budgetCurrency}`. No walletShare%/actual/mismatch.
- Builder is a pure shaper over `ReservePositionsResult` + the category list; excluded categories → name-only rows. New builder unit test (4 cases, green).
- `getReservesSummary` deps now `{reservePositions,categoriesRepo,budgetCurrencyOf,isReservesEnabled}`; `reserves_enabled=false` → disabled DTO.

**Task 2 — spendings summary onto engine cells** (`get-spendings-summary.ts`):

- `reserveUsedCents` + `overspentCents` for the viewed month come from `positions.get(id).byMonth.get(month)`; `balance = active − spent + reserveUsed`. `reserveAvailableCents` field removed; `fundedByCat`/`reserveActualCents` reads + min(overBy,F) fallback deleted; `reservePositions` is required. Test rewritten to drive a fake `reservePositions` returning engine cells (17 cases, green).

## Runtime sanity check (correctness-critical wiring)

- **Live schema confirmed**: `0030_phase05_reserve_model_reset` already dropped the `category_reserve_balance` VIEW and `categories.reserve_actual_cents`. `DrizzleCategoriesRepo.list()/findById()` still SELECTed the dropped column — that is what the reserves read path would 500 on. Fixed both SELECTs; `setReserveActualMany` is now a no-op (legacy allocator writes from the 05-13 mutation use-cases no longer hit a non-existent column).
- **Integration test green against real Postgres** (`test/tasks/reserve-topup.test.ts`, run via `infisical run`): rebuilt its `recomputeReserveTopupTask` deps onto the REAL replay orchestrator (event loader → reserve-engine), so it exercises engine-derived `surplus` end-to-end. 5 pass / 1 pre-existing skip / 0 fail. Asserts "TOPUP when wallets < reserves; WITHDRAW when wallets > reserves" and "resolves when mismatch corrected by wallet balance change".
- **HTTP route**: rebuilt + restarted the `api` image; `GET /budgets/:id/reserves` returns 401 (auth gate) — reachable, no import/wiring/VIEW 500. (An authenticated HTTP read could not be driven from inside the prebuilt image — `@budget/*` workspace modules don't resolve in the bundled artifact — but the identical factory-wired read path is covered by the green integration test against the live DB.)
- All reserve-related bun tests together: **49 pass / 1 skip / 0 fail** (domain engine golden + disable + multimonth + 3 application + topup). The engine (GREEN) was not modified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `categories-repo` SELECTed the dropped `reserve_actual_cents` column**

- **Found during:** Task 2 runtime sanity check (reserve-topup integration test 500'd: `column "reserve_actual_cents" of relation "categories" does not exist`).
- **Issue:** The 05-08/0030 reset dropped the column + VIEW, but `DrizzleCategoriesRepo.list()/findById()` still selected the column — so the reserves read path (which calls `categoriesRepo.list()`) crashed against the live schema.
- **Fix:** Removed the column from both SELECTs and the mapped `CategoryRow`; made `setReserveActualMany` a documented no-op so the 05-13 mutation use-cases' legacy writes stop targeting a non-existent column. Updated the integration-test seed to stop inserting the dropped column.
- **Files:** `categories-repo.ts`, `test/tasks/reserve-topup.test.ts`.
- **Commit:** 9a07211

**2. [Rule 3 - Blocking] Read path could not compile while mutation consumers referenced the old DTO/ReservePosition shape**

- **Issue:** Changing `ReservePosition`/`ReservesSummaryDto`/`getReservesSummary` deps broke compile in `recompute-reserve-topup-task` (read `mismatchCents`), `adjust-category-reserve` / `set-wallet-balance` / `update-wallet` (read `expectedReserveCents`/`fundedCents`/`reserveUsedByMonth`, called the removed 7/8-arg builder), and the factory — all transitive deps of the read path.
- **Fix (scoped):** `recompute-reserve-topup-task` reads `surplusCents` (same number, same sign). The three mutation use-cases build their post-mutation summary via the engine-derived `getReservesSummary` instead of the removed in-memory builder; their legacy allocator computation + writes were neutralised (writes no-op at the adapter). Their FULL rewrite ("adjust = append delta"; "wallet = set userDefined only") is 05-13 (per plan).
- **Files:** `recompute-reserve-topup-task.ts`, `adjust-category-reserve.ts`, `set-wallet-balance.ts`, `update-wallet.ts`, `factory.ts`.
- **Commits:** 58c7a5b, 9a07211

**3. [Rule 3 - Blocking] Package `exports` map missing two subpaths**

- **Issue:** `@budget/budgeting/src/application/get-reserve-positions` + `.../reserve-event-loader-repo` were not in `package.json` `exports`, so `tsc` (which honors `exports`) could not resolve the integration test's imports.
- **Fix:** Added both subpaths.
- **Commit:** 9a07211

## Deferred Breakage (documented in deferred-items.md)

- **05-13** — mutation use-cases (`adjust-category-reserve`, `set-wallet-balance`, `update-wallet`, `archive-wallet`, `archive-category`, `toggle-category-reserve-excluded`) still READ the dropped `category_reserve_balance` VIEW via `reserveBalanceRepo.getForBudget` + run the dead greedy allocator. They will 500 at runtime when invoked (writes already no-op). `reserve-allocator.ts` + `reserve-balance-repo.ts` + the `reserveActualCents` schema field are dead → delete in 05-13. `test/application/reserves-use-cases.test.ts` (41 tsc errors) is the 05-13 concern per the plan.
- **05-15** — `get-spendings-summary` dropped the `reserveAvailableCents` DTO field; web hooks (`use-spendings-summary.ts`, `use-create-transaction.ts` + its test) still read it (runtime-safe via `?? "0"`, type drifts). The reserves tab + spendings grid still consume the OLD `ReservesSummaryDto` shape — 05-15 reshapes them.
- **Pre-existing (NOT introduced here, present at HEAD~3)** — 14 tsc errors in `budget-template-apply` / `share-overrides-sum-trigger` / `frankfurter-adapter` / `category-domain` / `get-budget-home-summary.test`, plus the `@budget/worker` module-not-found inside an `it.skip(...)` Plan-06 sweep block in `reserve-topup.test.ts`. Out of scope.

## Verification

- `grep -rnE "accruedCents|fundedCents|expectedReserveCents|realReserveCents|reserveAvailableCents|walletSharePercent|mismatchCents"` across the 4 files → CLEAN.
- Non-test `src/` typecheck (budgeting package) → 0 errors.
- `bun test` get-reserve-positions + get-spendings-summary + reserves-summary-builder + reserve-engine golden → 37 pass / 0 fail.
- Reserve-topup integration test (real Postgres) → 5 pass / 0 fail.

## Self-Check: PASSED

All created/modified files exist on disk; all three task commits (a86b321, 58c7a5b, 9a07211) are in history.
