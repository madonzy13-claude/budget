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

# Deferred items — discovered during 05-13 execution

## 05-14 (contracts + API routes reshape)

`adjustCategoryReserve` result shape changed (decision E): `{ expectedCents,
actualCents, deltaCents, summary }` → `{ reserveCents, deltaCents, summary }`
(no `actualCents`; reserve is engine-derived). The route handler at
`apps/api/src/routes/budgets.ts:450` passes `result.value` straight through, so
the wire shape changed but the route code did not. 05-13 updated the route's own
integration test (`apps/api/test/routes/reserves-adjust.test.ts`) to the new
shape. 05-14 should formalise the route DTO/contract (and the OpenAPI/RPC type if
any) to `reserveCents`/`deltaCents`.

## 05-15 (web reshape)

The web reserve-adjust hooks still mirror the OLD greedy allocator + old result
fields. Out of 05-13's scope (web), flagged for 05-15:

- `apps/web/src/lib/reserve-allocator.ts` — hand-kept MIRROR of the now-DELETED
  backend `packages/budgeting/src/domain/reserve-allocator.ts`. Backend copy is
  gone; the web optimistic-update mirror should be removed/rewritten to the
  engine model.
- `apps/web/src/hooks/use-update-reserve-adjustment.ts` — imports the web
  allocator + reads `reserveActualCents` / old adjust result fields.

## 05-16 (delete orphaned code)

- Backend `packages/budgeting/src/domain/reserve-allocator.ts` + its test were
  DELETED in 05-13 (nothing in `src` imported them after the use-case rewrite).
  The spec had earmarked this for 05-16; done early. `reserve-engine.ts` still
  carries a one-line doc reference ("Replaces the greedy reserve-allocator.ts")
  — harmless historical note, engine file is out of 05-13's edit scope.
- `reserve-balance-repo.ts` (+ port) reads the dropped `category_reserve_balance`
  VIEW (line 76) but is STILL WIRED into live `apps/api/src/boot.ts`,
  `apps/worker/src/worker.ts`, and `budget-home-summary-repo` consumers, so it is
  NOT dead yet — left in place. 05-13 removed it only from the reserve mutation
  use-cases + their factory/worker-sweep wiring. Its full removal (once the
  remaining consumers stop reading the VIEW) belongs to a later cleanup.

## Pre-existing breakage CONFIRMED (NOT caused by 05-13 — present at 0e342a1)

- `apps/api/test/routes/wallets.test.ts` — "PUT /wallets/:id/balance overwrites
  current_balance…" FAILS: it asserts `fresh.currentBalance` but the GET
  `/wallets/:id` DTO field is `currentBalanceCents` (WalletDto renamed the field
  in the tasks-redesign branch and the test was not updated). Verified failing at
  `0e342a1` (05-12 baseline) before any 05-13 work — SPENDINGS wallet, GET route
  untouched by reserves. Out of scope (test-vs-DTO field-name drift); a wallets
  plan should update the assertion to `currentBalanceCents`.
