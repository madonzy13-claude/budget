---
phase: 05-reserves-wallets-tabs
plan: 13
subsystem: api
tags: [reserves, drizzle, hexagonal, replay-engine, tasks-queue, hono]

# Dependency graph
requires:
  - phase: 05-reserves-wallets-tabs (05-09..05-12)
    provides: reserve-engine (pure fold), get-reserve-positions replay orchestrator, event-loader repo, reserves-summary-builder, new ReservesSummaryDto
provides:
  - "adjust-category-reserve = delta-only append (decision E): delta = target − currentR from the orchestrator; no greedy allocation, no stored actual"
  - "set-wallet-balance / update-wallet set userDefined only (Σ RESERVE balances) — no per-category allocation (decision C)"
  - "archive-category honours both deletion modes (decision J) — category leaves internal going forward, no sibling spill"
  - "archive-wallet + toggle-exclude drop reserve from internal + recompute RESERVE_TOPUP; categories independent"
  - "recompute-reserve-topup-task is a single budget-level surplus reconcile driven straight off the orchestrator (surplus<0 TOPUP, >0 WITHDRAW, 0/disabled resolve)"
  - "setReserveActualMany + reserveActualCents removed; dead greedy reserve-allocator deleted"
affects:
  [05-14 (route/contract reshape), 05-15 (web reshape), 05-16 (orphan cleanup)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Replay-on-read mutation: the only durable reserve write is the append-only signed adjustment delta; everything else (R, internal, surplus, summary) is recomputed by re-reading the orchestrator"
    - "Surplus-driven task reconcile: RESERVE_TOPUP emit/resolve reads positions.surplusCents + direction directly (no summary round-trip)"
    - "A2 own-tx recompute hook: mutations open a separate withTenantTx for the idempotent RESERVE_TOPUP emit/resolve"

key-files:
  created: []
  modified:
    - packages/budgeting/src/application/adjust-category-reserve.ts
    - packages/budgeting/src/application/recompute-reserve-topup-task.ts
    - packages/budgeting/src/application/set-wallet-balance.ts
    - packages/budgeting/src/application/update-wallet.ts
    - packages/budgeting/src/application/archive-category.ts
    - packages/budgeting/src/application/archive-wallet.ts
    - packages/budgeting/src/application/toggle-category-reserve-excluded.ts
    - packages/budgeting/src/ports/categories-repo.ts
    - packages/budgeting/src/adapters/persistence/categories-repo.ts
    - packages/budgeting/src/contracts/factory.ts
    - apps/worker/src/worker.ts
    - packages/budgeting/test/application/reserves-use-cases.test.ts
    - packages/budgeting/test/tasks/reserve-topup.test.ts
    - apps/api/test/routes/reserves-adjust.test.ts

key-decisions:
  - "Consolidated the plan's 3 task commits into 1 atomic source commit: factory.ts + reserves-use-cases.test.ts carry interleaved Task 0/1/2 changes that cannot be split mid-file without a non-compiling intermediate commit (every commit must build)."
  - "Did NOT delete reserve-balance-repo.ts (+ port): still wired into live boot.ts / worker.ts / budget-home-summary consumers — not dead. Only removed it from the reserve mutation use-cases + their factory/worker-sweep wiring."
  - "adjust result shape: { expectedCents, actualCents, deltaCents, summary } → { reserveCents, deltaCents, summary } (no actualCents; reserve is engine-derived)."

patterns-established:
  - "Per-category independence: adjust/exclude/archive of one category never refills siblings (the greedy allocator is gone)."
  - "RESERVE wallet edits are userDefined-only: the wallet balance moves Σ RESERVE balances; internal (ΣR) is engine-derived and untouched."

requirements-completed: [RSRV-REWRITE-USECASES]

# Metrics
duration: 23min
completed: 2026-06-05
---

# Phase 5 Plan 13: Reserve Mutation Use-Cases Rewrite Summary

**Reserve mutations now match the replay model: adjust appends one signed delta (target − currentR from the orchestrator), RESERVE/wallet edits set userDefined only, archive honours both deletion modes, and RESERVE_TOPUP is a single budget-level surplus reconcile — all greedy allocator + stored-actual bookkeeping deleted.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-06-05T10:33:12Z
- **Completed:** 2026-06-05T10:57:03Z
- **Tasks:** 3 (Task 0 adjust/topup, Task 1 wallet, Task 2 archive/exclude)
- **Files modified:** 14 (+2 deleted)

## Accomplishments

- **adjust-category-reserve** rewritten to delta-only: `currentR` from `reservePositions.get(cat).reserveCents`, append `delta = target − currentR` (no-op on 0), return the engine-derived summary, recompute RESERVE_TOPUP. No `applyExpectedChange`, no `setReserveActualMany`, no VIEW read — the runtime 500s (dropped `category_reserve_balance` VIEW) are gone.
- **set-wallet-balance / update-wallet** strip the RESERVE allocation block; a RESERVE wallet edit / type-flip now changes only the wallet balance (→ userDefined = Σ RESERVE balances), recomputes RESERVE_TOPUP, and returns the orchestrator summary.
- **archive-category** supports both decision-J modes (`current_future` = prior closed months read-only via `archivedFrom`; `all` = `hideAll`), drops the category from internal going forward, recomputes RESERVE_TOPUP. No `applyExclude` sibling release.
- **archive-wallet + toggle-category-reserve-excluded** drop reserve from internal + recompute RESERVE_TOPUP; categories stay independent (no spill/refill).
- **recompute-reserve-topup-task** reshaped to read `positions.surplusCents` + direction directly (drops `getReservesSummary`/`mismatchCents`): surplus<0 → TOPUP, >0 → WITHDRAW, 0/disabled → resolve. Single budget-level idempotent task.
- **Dead code removed:** `setReserveActualMany` (port + adapter), `reserveActualCents` from `CategoryRow`, the greedy `reserve-allocator.ts` (+ its test). Factory + worker-sweep deps rewired to the trimmed helper.
- **End-to-end runtime sanity-check (real Postgres):** `apps/api/test/routes/reserves-adjust.test.ts` POSTs the adjust route → use-case → event-loader → reserve-engine, returns **200** with `{ reserveCents: "50000", deltaCents: "-25000", summary }`, appending a `category_reserve_adjustments` row. No VIEW, no allocator, no 500.

## Task Commits

1. **Tasks 0+1+2 (source):** `fb00993` (feat) — all 3 tasks' source + factory + worker + `reserves-use-cases.test.ts` + `reserve-topup.test.ts` + allocator deletions. Consolidated because the shared factory + use-case test interleave all three tasks (see Deviations).
2. **Task 0/1/2 route test:** `b362efd` (test) — `reserves-adjust.test.ts` rewired to the new deps + asserts the engine summary + delta shape (the end-to-end runtime sanity-check).

**Plan metadata:** committed separately with this SUMMARY + STATE/ROADMAP.

_Note: the plan specified 3 task commits; the shared interleaved files made a single atomic source commit the only way to keep every commit compiling — see Deviations._

## Files Created/Modified

- `packages/budgeting/src/application/adjust-category-reserve.ts` — delta-only append + engine summary + RESERVE_TOPUP recompute.
- `packages/budgeting/src/application/recompute-reserve-topup-task.ts` — surplus/direction-driven emit/resolve off the orchestrator; deps trimmed to `{ taskRepo, reservePositions, budgetCurrencyOf, isReservesEnabled }`.
- `packages/budgeting/src/application/set-wallet-balance.ts` — RESERVE branch sets userDefined only; summary via orchestrator.
- `packages/budgeting/src/application/update-wallet.ts` — type/amount change sets userDefined only; was-or-is-RESERVE recompute.
- `packages/budgeting/src/application/archive-category.ts` — both modes, no sibling release, optional RESERVE_TOPUP recompute.
- `packages/budgeting/src/application/archive-wallet.ts` — archive + RESERVE_TOPUP recompute (no actual recalc).
- `packages/budgeting/src/application/toggle-category-reserve-excluded.ts` — flag-only + RESERVE_TOPUP recompute (no sibling refill).
- `packages/budgeting/src/ports/categories-repo.ts` — removed `setReserveActualMany` + `reserveActualCents`.
- `packages/budgeting/src/adapters/persistence/categories-repo.ts` — removed the `setReserveActualMany` no-op.
- `packages/budgeting/src/contracts/factory.ts` — rewired all reserve mutation use-cases to the engine deps; removed a stale `createSpendingsSummaryRepo` import.
- `apps/worker/src/worker.ts` — sweep `reserveTopup` deps trimmed to the new helper shape; removed now-unused repo imports.
- `packages/budgeting/test/application/reserves-use-cases.test.ts` — rewritten for the new model (delta append / no-op / userDefined-only / both archive modes / exclude-no-spill / engine summary), port-level mocks only.
- `packages/budgeting/test/tasks/reserve-topup.test.ts` — helper deps trimmed; direction/idempotency driven via the real orchestrator surplus.
- `apps/api/test/routes/reserves-adjust.test.ts` — new deps + new-shape assertions (runtime sanity-check).
- **Deleted:** `packages/budgeting/src/domain/reserve-allocator.ts`, `packages/budgeting/test/domain/reserve-allocator.test.ts`.

## Decisions Made

- **3 commits → 1 atomic source commit.** `factory.ts` and `reserves-use-cases.test.ts` carry interleaved Task 0/1/2 edits; splitting them across 3 commits would produce a non-compiling intermediate (e.g. factory wiring new deps while a use-case still has the old signature). Every commit must build, so the source landed atomically.
- **Kept `reserve-balance-repo.ts`.** It reads the dropped VIEW but is still wired into live `boot.ts` / `worker.ts` / `budget-home-summary` consumers — not dead. Removing it is later cleanup.
- **adjust result shape change** (`expectedCents`/`actualCents` → `reserveCents`/`deltaCents`) — route passes `result.value` through; the wire DTO is formalised in 05-14.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worker sweep wired the removed helper deps**

- **Found during:** post-Task-0 typecheck of `apps/worker`.
- **Issue:** `apps/worker/src/worker.ts` built `BudgetingReconciliationSweepDeps.reserveTopup` with `categoriesRepo` / `reserveBalanceRepo` / `reservesSummaryRepo`, which the trimmed `RecomputeReserveTopupTaskDeps` no longer accepts → `apps/worker` failed to compile.
- **Fix:** removed the three repos from the `reserveTopup` literal + their now-unused declarations + imports. `reservePositions` (from `createBudgetingModule`) remains the source of truth.
- **Files modified:** `apps/worker/src/worker.ts`
- **Verification:** `tsc -p apps/worker` → 0 errors.
- **Committed in:** `fb00993`

**2. [Rule 1 - Bug] reserves-adjust route test used stale deps + asserted dropped fields**

- **Found during:** end-to-end runtime sanity-check.
- **Issue:** `apps/api/test/routes/reserves-adjust.test.ts` built `adjustCategoryReserve` with the removed `reserveBalanceRepo`/`reservesSummaryRepo` (and was MISSING the now-required `reservePositions`), and asserted `body.expectedCents`/`body.actualCents`. The happy path returned 422 (the use-case threw on `undefined` reservePositions).
- **Fix:** wired the real replay orchestrator (event loader → reserve-engine) and asserted the new `{ reserveCents, deltaCents, summary }` shape; this doubles as the end-to-end real-Postgres sanity-check.
- **Files modified:** `apps/api/test/routes/reserves-adjust.test.ts`
- **Verification:** route test 8 pass / 0 fail; adjust returns 200 with the new shape, no VIEW/500.
- **Committed in:** `b362efd`

**3. [Rule 3 - Blocking] Stale `createSpendingsSummaryRepo` import blocked the lint gate**

- **Found during:** pre-commit lint-staged (`eslint --max-warnings=0`).
- **Issue:** a pre-existing unused `createSpendingsSummaryRepo` import in `factory.ts` (from 05-12) failed the commit's lint gate once I was editing the file.
- **Fix:** removed the dead import (+ removed an unused type import in `adjust-category-reserve.ts`).
- **Files modified:** `packages/budgeting/src/contracts/factory.ts`, `packages/budgeting/src/application/adjust-category-reserve.ts`
- **Verification:** `eslint --max-warnings=0` over all committed files → 0.
- **Committed in:** `fb00993` (amended)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug). **Impact:** all required to keep the build/lint green and to prove the mutation end-to-end. No scope creep — the route-test fix is direct collateral of the contract change.

## Issues Encountered

- **Port-level unit tests open a real `withTenantTx`.** The archive-\*/toggle-exclude RESERVE_TOPUP recompute hook opens a real tx even with mocked taskRepo/positions. From the test runner the in-cluster `@db:` host fails DNS. Resolved by applying the same `@db:`→`@localhost:` env fixup + `resetPools()` the integration tests use (the emit/resolve direction itself stays integration-tested in `reserve-topup.test.ts`).
- **Pre-existing wallets-GET NaN (NOT mine).** `apps/api/test/routes/wallets.test.ts` "PUT /wallets/:id/balance…" asserts `fresh.currentBalance` but the GET DTO field is `currentBalanceCents`. Verified failing at `0e342a1` (05-12 baseline) — SPENDINGS wallet, GET route untouched by reserves. Logged to `deferred-items.md`; out of scope.

## Pre-existing out-of-scope (left untouched, per prompt)

15 tsc errors in `budget-template-apply` / `share-overrides-sum-trigger` / `frankfurter-adapter` / `category-domain` / `get-budget-home-summary.test` / the `@budget/worker` `it.skip` block in `reserve-topup.test.ts` — all predate this plan (confirmed in `deferred-items.md`).

## Next Phase Readiness

- **05-14** (contracts + API routes reshape): formalise the adjust wire DTO to `{ reserveCents, deltaCents }`; reshape the remaining reserve routes/contracts.
- **05-15** (web reshape): remove the web `reserve-allocator.ts` mirror + `use-update-reserve-adjustment.ts`; consume the new `reserve/used/overspent` + `internal/userDefined/surplus` DTO.
- **05-16** (orphan cleanup): backend allocator already deleted; retire `reserve-balance-repo` once its remaining live consumers (boot/worker/budget-home) stop reading the dropped VIEW.

## Self-Check: PASSED

- FOUND: `.planning/phases/05-reserves-wallets-tabs/05-13-SUMMARY.md`
- FOUND: `packages/budgeting/src/application/recompute-reserve-topup-task.ts`
- CONFIRMED DELETED: `packages/budgeting/src/domain/reserve-allocator.ts` (+ its test)
- FOUND commit: `fb00993` (feat — reserve mutation rewrite)
- FOUND commit: `b362efd` (test — reserves-adjust route)

---

_Phase: 05-reserves-wallets-tabs_
_Completed: 2026-06-05_
