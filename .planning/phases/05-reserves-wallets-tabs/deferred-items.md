# Deferred items — discovered during 05-12 execution

These were found while wiring the reserves READ path (05-12). They are out of
this plan's scope (the plan touches the 4 read-path application files + their
tests). Logged for the owning plans; NOT fixed here.

## 05-13 (mutation use-cases + reserves-use-cases test)

The live DB (migration `0030_phase05_reserve_model_reset`) has already DROPPED
both `budgeting.category_reserve_balance` (VIEW) and
`budgeting.categories.reserve_actual_cents` (column). The following mutation
use-cases still READ the dropped VIEW via `reserveBalanceRepo.getForBudget` and
run the dead greedy allocator (`applyExpectedChange` / `applyWalletDelta`).
Their writes to `reserve_actual_cents` were already neutralised (categories-repo
`setReserveActualMany` is now a no-op), but the VIEW READ will still 500 at
runtime when these endpoints are invoked. 05-13 rewrites them to the engine
model ("adjust = append signed delta"; "set/update wallet = set userDefined only").

- `packages/budgeting/src/application/adjust-category-reserve.ts` (reads VIEW + allocator)
- `packages/budgeting/src/application/set-wallet-balance.ts` (allocator)
- `packages/budgeting/src/application/update-wallet.ts` (allocator)
- `packages/budgeting/src/application/archive-wallet.ts` (allocator)
- `packages/budgeting/src/application/archive-category.ts` (allocator)
- `packages/budgeting/src/application/toggle-category-reserve-excluded.ts` (allocator)
- `packages/budgeting/src/domain/reserve-allocator.ts` — dead; delete in 05-13.
- `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` — reads dropped VIEW; delete in 05-13.
- `packages/budgeting/src/adapters/persistence/categories-schema.ts` — still declares `reserveActualCents`; drop from the Drizzle schema in 05-13.
- `packages/budgeting/test/application/reserves-use-cases.test.ts` — 41 tsc errors against the old DTO/mutation shapes (plan 05-12 explicitly defers this to 05-13).

## 05-15 (web reshape)

`get-spendings-summary` removed the `reserveAvailableCents` DTO field (per plan:
"PREFER removing it and updating the web hook in 05-15"). Web consumers still
read it (runtime-safe via `?? "0"`, but the Hono RPC type drifts):

- `apps/web/src/hooks/use-spendings-summary.ts`
- `apps/web/src/hooks/use-create-transaction.ts`
- `apps/web/test/hooks/use-create-transaction.test.tsx`

The reserves tab + spendings grid also still consume the OLD `ReservesSummaryDto`
shape (`reserveBalanceCents`, `walletSharePercent`, `totals.mismatchCents`) —
05-15 reshapes them to `reserve/used/overspent` + `internal/userDefined/surplus`.

## Pre-existing (NOT introduced by 05-12 — present before this plan)

These tsc errors exist at `HEAD~3` (before any 05-12 work) and are unrelated to
reserves. Out of scope; left untouched.

- `test/budget-template-apply.test.ts` (5)
- `test/share-overrides-sum-trigger.test.ts` (3)
- `test/frankfurter-adapter.test.ts` (3)
- `test/category-domain.test.ts` (2)
- `test/application/get-budget-home-summary.test.ts` (1)
- `test/tasks/reserve-topup.test.ts` — 1 remaining: `@budget/worker/src/handlers/
budgeting-reconciliation` module-not-found inside an `it.skip(...)` Plan-06 sweep
  block (documented infra debt; the skipped test does not run).
