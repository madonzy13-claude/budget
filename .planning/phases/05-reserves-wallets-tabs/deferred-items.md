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

# Deferred items — discovered during 05-14 execution

## Home-summary / reserve-balance-repo VIEW-read finding (RESOLVED: no live 500 risk)

The "also check" concern (does any LIVE read path still hit the dropped
`budgeting.category_reserve_balance` VIEW → 500 at runtime?) was investigated
and is **clear**:

- `reserve-balance-repo.ts.getForBudget()` (reads the dropped VIEW, lines 76/302/ 329) has **ZERO live call sites** in `src` (`grep -rn "\.getForBudget(" apps
packages | grep -v test` → empty).
- `budget-home-summary-repo.ts` computes reserve/cushion via its OWN inline SQL
  against `budgeting.category_limits` (cushion_amount), NOT the VIEW. It only
  mentions `reserve-balance-repo` in a doc COMMENT. So the budget HOME summary
  read path does NOT touch the dropped VIEW — no 500.
- `reserve-event-loader-repo.ts` mentions `reserve-balance-repo` only in a comment
  ("Replaces the VIEW-based reserve-balance-repo reads"); it reads raw events, not
  the VIEW.

**05-14 change:** removed the last live WIRING of `reserve-balance-repo` —

- factory.ts: deleted the `reserveBalanceRepo` BudgetingModule field +
  `createReserveBalanceRepo`/`ReserveBalanceRepo` imports (zero readers; the
  `module.reserveBalanceRepo` field had no consumer anywhere, incl. worker).
- boot.ts: deleted the dead `reserveBalanceRepo` + `reservesSummaryRepo` (+ unused
  `DrizzleCategoriesRepo`) constructions/imports.

The api boots clean + healthy after this (composition root has no live dep on the
repo). This SUPERSEDES the 05-16 note above ("STILL WIRED into live boot.ts ...
NOT dead yet"): `reserve-balance-repo.ts` + its port + the `DrizzleReservesSummaryRepo`
`sumReserveWalletAmounts`-only usage are now the ONLY remaining surface.

## 05-16 (delete orphaned code) — UPDATED after 05-14

- `reserve-balance-repo.ts` + `ports/reserve-balance-repo.ts` are now fully
  orphaned (no `src` importer after 05-14 removed the boot/factory field). Safe to
  DELETE in 05-16 along with the dropped-VIEW SQL. Confirm `apps/worker/src/worker.ts`
  (only a comment reference today) stays clean.
- `reserves-summary-repo.ts` is STILL LIVE but trimmed to a single method —
  `sumReserveWalletAmounts` (Σ RESERVE-wallet `current_balance`), consumed by the
  event-loader for `userDefinedCents`. Do NOT delete the class; the old greedy
  share methods (if any remain) can be pruned. Verify before removing anything.

## 05-15 (web reshape) — still outstanding (unchanged by 05-14)

The `/reserves` + `/spendings-summary` WIRE contracts are now locked to the engine
shape (rows{reserveCents,usedCents,overspentCents}; totals{internalCents,
userDefinedCents,surplusCents,direction,disabled,budgetCurrency}; adjust →
{reserveCents,deltaCents,summary}; spendings categories carry reserveUsedCents +
overspentCents + balanceCents, NO reserveAvailableCents). The web hooks/components
still consume the OLD shape and must be reshaped in 05-15:

- `apps/web/src/hooks/use-spendings-summary.ts`, `use-create-transaction.ts`,
  `use-update-reserve-adjustment.ts`, `apps/web/src/lib/reserve-allocator.ts`
  (delete the dead mirror), and the reserves-tab + spendings-grid components.

# Deferred items — discovered during 05-19 execution

## Stale E2E: `tests/e2e/features/reserves/share-math-and-zero-state.feature` (@phase5)

- **Found during:** 05-19 broader `@phase5` reserves E2E sweep (verification).
- **Status:** 6 scenarios fail (3 × chromium + mobile) — "show correct shares",
  "Actual and share render as zero", "reflects the reserve wallet balance".
- **Root cause:** This feature tests the OLD Expected/Actual/**Share** reserve
  model, REMOVED in plan **05-15** (engine-model reshape → single Reserve value).
  It was never retired when the Share column was dropped, so it has been red
  since 05-15 — predates and is unrelated to 05-19's relabel work.
- **Untouched by 05-19:** last commit on the file is `d435945` (pre-05-15
  "split share column"). 05-19 changed no Share/Actual UI or steps; none of the
  failing scenarios reference 05-19's new keys (`Total available` / `Total in
wallets` / `Total used` / `column.available` / `reserves-total-used`).
- **Scope:** Owner of the 05-15 Share-removal cleanup should retire this feature
  (the Share model no longer exists) or rewrite it against the single-value
  model. NOT fixed in 05-19 per executor scope boundary (pre-existing failure in
  a file the plan did not modify).
