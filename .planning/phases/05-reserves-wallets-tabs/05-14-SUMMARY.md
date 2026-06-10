---
phase: 05-reserves-wallets-tabs
plan: 14
subsystem: api
tags:
  [
    reserves,
    hono,
    drizzle,
    postgres,
    integration-tests,
    dto-contract,
    hexagonal,
  ]

# Dependency graph
requires:
  - phase: 05-11
    provides: reserve-event-loader-repo (raw event reads, RLS)
  - phase: 05-12
    provides: get-reserve-positions replay orchestrator + reshaped ReservesSummaryDto + get-spendings-summary engine cells
  - phase: 05-13
    provides: reserve mutation use-cases (adjust → signed delta; wallet → userDefined-only; surplus topup); reserve-balance-repo removed from mutation wiring
provides:
  - Composition root (factory + boot) free of the dead VIEW-backed reserve repos; api boots clean on the engine read path
  - Locked /reserves WIRE contract — rows{reserveCents,usedCents,overspentCents}, totals{internalCents,userDefinedCents,surplusCents,direction,disabled,budgetCurrency}; adjust → {reserveCents,deltaCents,summary}
  - Locked /spendings-summary WIRE contract — categories carry reserveUsedCents+overspentCents+balanceCents; reserveAvailableCents gone
  - Real-Postgres integration tests proving the new shape + key-absence + adjust ledger delta + disabled path (25 reserve-route tests green)
affects:
  [
    05-15 (web reshape consumes these wire contracts),
    05-16 (delete now-orphaned reserve-balance-repo),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reserve reads are engine-derived end-to-end: route → getReservesSummary/getSpendingsSummary → reservePositions (event-loader → reserve-engine). No VIEW, no stored actual, no greedy allocator anywhere in the live graph."
    - "Route handlers stay thin: forward result.value; the DTO is shaped in the use-case. Reshaping the DTO needed zero route field-logic changes."

key-files:
  created: []
  modified:
    - packages/budgeting/src/contracts/factory.ts
    - apps/api/src/boot.ts
    - apps/api/test/routes/reserves.test.ts
    - apps/api/test/routes/spendings-summary.test.ts
    - .planning/phases/05-reserves-wallets-tabs/deferred-items.md

decisions:
  - "Did NOT delete reserve-balance-repo.ts / its port in this plan — only removed the last live WIRING (factory field + boot construction). File deletion belongs to 05-16 (spec sequencing) and the repo no longer compile-blocks anything once the field is gone."
  - "reserves-summary-repo.ts kept (LIVE): trimmed to sumReserveWalletAmounts, which the event-loader uses for userDefinedCents. Only its construction in boot was dead and removed."
  - "Disabled-path + cross-tenant tests use buildApp(isReservesEnabled override) / tenantIds override (RLS blocks an app-role UPDATE of tenancy.budgets in test ctx) — mirrors reserves-adjust.test.ts."

metrics:
  duration: ~25m
  completed: 2026-06-05
---

# Phase 05 Plan 14: Reserve Contracts + API Routes Reshape Summary

Rewired the budgeting composition root off the dropped `category_reserve_balance` VIEW and locked the `/reserves` + `/spendings-summary` HTTP contracts to the engine-derived shape, proven by real-Postgres integration tests (25 reserve-route tests green; api boots healthy).

## What shipped

### Task 0 — composition root (factory + boot) — commit `6553043`

The application layer was already reshaped by 05-12/05-13 (DTOs, use-case deps, and even the factory's `getReservePositions({ eventLoader })` wiring were in place — the monorepo already type-checked clean). The remaining Task-0 work was removing the now-dead VIEW-backed plumbing:

- **factory.ts**: deleted the `reserveBalanceRepo` `BudgetingModule` field + its construction + the `createReserveBalanceRepo` / `ReserveBalanceRepo` imports. Verified ZERO readers of `module.reserveBalanceRepo` anywhere (incl. worker — only a comment).
- **boot.ts**: deleted the dead `reserveBalanceRepo` + `reservesSummaryRepo` constructions and the unused `DrizzleCategoriesRepo` import. `getSpendingsSummary` already reads `baseBudgeting.reservePositions`; the event-loader is built inside the factory, not boot.
- `bun run typecheck` (whole monorepo) stays clean (EXIT=0). `make restart-api` → `"apps/api booted"` + container **healthy** (no composition-root regression from the removals).

### Task 1 — /reserves + /spendings-summary new-shape integration tests (TDD) — commit `4cea6d7`

Routes (`budgets.ts` reserves GET + adjust; `spendings-summary.ts`) are thin and forward `result.value`, so the reshaped DTOs serialize automatically — confirmed, no route field-logic change. The deliverable was the tests, which were wired to the OLD use-case deps and broke (RED: `deps.reservePositions is not a function`). Rewired both to the REAL replay orchestrator (event-loader → reserve-engine) against real Postgres:

- **reserves.test.ts** (7 tests): seeds 2 categories + limits + a RESERVE wallet (3000.00 → `userDefinedCents "300000"`). Asserts GET /reserves new keys PRESENT (rows reserve/used/overspent; totals internal/userDefined/surplus/direction/disabled/budgetCurrency), dead keys ABSENT (walletSharePercent, walletShareAmountCents, reserveBalanceCents, mismatchCents, totalCategoryReservesCents, expected/actual), `direction === WITHDRAW`. Adjust path: `reserveCents "50000"` + `deltaCents "50000"` + engine `summary` (internal 50000, surplus 250000) + exactly ONE signed `delta_cents` row in `category_reserve_adjustments`. Disabled path: `totals.disabled === true`, `rows []`. Plus 401 / 404 gate tests.
- **spendings-summary.test.ts** (6 tests): rewired `getSpendingsSummary` to `reservePositions` (dropped the dead `reserveBalanceRepo`/`reservesSummaryRepo` deps). Added `reserveUsedCents` PRESENT + `reserveAvailableCents` ABSENT assertions.

Combined reserve-route run (reserves + reserves-adjust + spendings-summary + category-reserve-excluded): **25 pass, 0 fail** on real Postgres.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RLS tenant context lost in the direct ledger-verification query**

- **Found during:** Task 1 (first GREEN run — adjust HTTP assertions passed but the direct `category_reserve_adjustments` count returned 0).
- **Issue:** the verification SELECT set `app.tenant_ids`/`app.current_user_id` with `set_config(..., is_local=true)` but ran in autocommit (no surrounding transaction), so the local GUC was dropped before the SELECT and RLS filtered the row out.
- **Fix:** wrapped the set_config + SELECT in an explicit `BEGIN … COMMIT` (the same pattern the fixtures use), added `delta_cents::text` cast + ROLLBACK-on-error.
- **Files modified:** apps/api/test/routes/reserves.test.ts
- **Commit:** `4cea6d7`

### Scope notes (not deviations)

- **Task 0 wiring was largely pre-done by 05-13.** The plan's read_first described OLD-deps factory lines that no longer existed at HEAD (`bcec6d3` already had `getReservePositions({ eventLoader })` and trimmed use-case deps). Only the dead `reserveBalanceRepo` field/constructions remained to remove. Documented rather than re-doing settled work.
- **contracts/api.ts unchanged (as the plan states).** It holds only the Zod REQUEST schemas (`reserveAdjustmentSchema` with `expectedCents`) — the response DTOs live in the application layer (`get-reserves-summary.ts` `ReservesSummaryDto`), already reshaped in 05-12. No contracts-file DTO mirror exists.
- **Adjacent routes (wallets / categories / budget-identity / budget-settings) verified, not edited.** Out of the plan's declared `files_modified`, but I confirmed they are thin forwarders to the reshaped use-cases and carry ZERO dead reserve DTO keys; each already has an integration test. Nothing to change.

## "Also check" finding — home-summary / reserve-balance-repo VIEW (NO live 500 risk)

Investigated whether any LIVE read path still hits the dropped `budgeting.category_reserve_balance` VIEW (would 500 at runtime). **Clear:**

- `reserve-balance-repo.getForBudget()` (the VIEW reader) has **ZERO live call sites** (`grep -rn "\.getForBudget(" apps packages | grep -v test` → empty).
- `budget-home-summary-repo.ts` computes reserve/cushion from its OWN inline SQL against `budgeting.category_limits` (cushion_amount) — it references `reserve-balance-repo` only in a doc COMMENT. The budget HOME summary path does NOT touch the dropped VIEW.
- `reserve-event-loader-repo.ts` mentions it only in a comment; it reads raw events.

05-14 removed the last live wiring (factory field + boot constructions) and api boots healthy, so `reserve-balance-repo.ts` is now fully orphaned. Recorded for 05-16 (file deletion) in `deferred-items.md`; corrected the stale 05-16 note that claimed it was "STILL WIRED into live boot.ts".

## Deferred items (recorded in deferred-items.md)

- **05-16:** delete the now-orphaned `reserve-balance-repo.ts` + `ports/reserve-balance-repo.ts` (+ the dropped-VIEW SQL). Keep `reserves-summary-repo.ts` (LIVE — `sumReserveWalletAmounts` feeds userDefined).
- **05-15:** web hooks/components still consume the OLD shape (`use-spendings-summary.ts`, `use-create-transaction.ts`, `use-update-reserve-adjustment.ts`, `apps/web/src/lib/reserve-allocator.ts` dead mirror, reserves-tab + spendings-grid). Reshape to the now-locked engine wire contracts.

## Verification

- `bun run typecheck` (monorepo, incl. tests): clean (EXIT=0).
- reserve-route subset (reserves, reserves-adjust, spendings-summary, category-reserve-excluded): 25 pass / 0 fail, real Postgres.
- `grep -rn "mismatchCents\|walletShare\|reserveBalanceCents\|reserveAvailableCents" apps/api/src` → none.
- `docker compose build api` (EXIT 0) + `make restart-api` → `"apps/api booted"`, container healthy, no startup error from the wiring removals.
- `graphify update .` ran (8181 nodes) — reflects the dropped repo edges.

## Self-Check: PASSED

- Commits `6553043`, `4cea6d7` — FOUND in git log.
- factory.ts, boot.ts, reserves.test.ts, spendings-summary.test.ts, deferred-items.md, 05-14-SUMMARY.md — all FOUND on disk.

## TDD Gate Compliance

Plan type is `execute` (not `tdd`), and Task 1 carries `tdd="true"`. RED was captured (existing tests failed with `deps.reservePositions is not a function` against the reshaped use-case), then GREEN (rewired to the real orchestrator → 25 pass). The behavior (route DTO shape) was already implemented by 05-12/05-13, so this is a confirm-and-lock TDD task — the failing-test commit and passing-test state are the same `test(05-14)` commit (`4cea6d7`), as the implementation pre-existed. No separate `feat` gate is expected for a contract-lock test task.
