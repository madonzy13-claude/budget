---
phase: 05-reserves-wallets-tabs
plan: 05-17
subsystem: budgeting / tasks
tags: [reserves, tasks, RESERVE_TOPUP, bugfix, TDD]
requires: [05-13, 05-14]
provides: [reserve-topup-recompute-on-usage-mutations]
affects:
  [
    create-transaction,
    edit-transaction,
    set-category-limit,
    toggle-budget-mode,
    confirm-recurring-draft,
    edit-and-confirm-recurring-draft,
    contracts/factory,
  ]
key-files:
  modified:
    - packages/budgeting/src/application/create-transaction.ts
    - packages/budgeting/src/application/edit-transaction.ts
    - packages/budgeting/src/application/set-category-limit.ts
    - packages/budgeting/src/application/toggle-budget-mode.ts
    - packages/budgeting/src/application/confirm-recurring-draft.ts
    - packages/budgeting/src/application/edit-and-confirm-recurring-draft.ts
    - packages/budgeting/src/contracts/factory.ts
    - packages/budgeting/test/tasks/reserve-topup.test.ts
decisions:
  - "Wire recompute into use cases (not just the route) so coverage is independent of which route/worker path mutates the ledger."
  - "Deps OPTIONAL + gated (taskRepo? reservePositions? budgetCurrencyOf? isReservesEnabled?) so legacy/budget-scoped callers keep compiling; matches archive-category/set-category-limit precedent."
  - "Best-effort own-tx A2: a recompute failure NEVER fails the user's mutation — the hourly sweep is the backstop."
  - "Engine/math/emit SQL unchanged — only the trigger gap was closed."
metrics:
  duration: ~25m
  completed: 2026-06-06
---

# Phase 05 Plan 17: RESERVE_TOPUP stays live across usage-driven mutations Summary

**One-liner:** Closed the trigger gap so a transaction (or limit/cushion change) that draws reserve refreshes the persisted RESERVE_TOPUP task to the live engine surplus — fixing the stale "Withdraw 572 vs card 300 extra" the user saw.

**Status:** ✅ Complete. RED→GREEN→live-verified. Zero new tsc / test / ci-gate regressions (all observed failures are pre-existing and out-of-scope, confirmed identical on clean HEAD).
**Date:** 2026-06-06

## The bug (confirmed, then proven by a failing test)

In the new reserve model `internal = ΣR` changes whenever reserve is **used** — a confirmed transaction overspends a category and draws reserve (engine op1: `R -= draw` → `internal = ΣR` drops → `surplus = userDefined − internal` rises). The reserves **banner** (`getReservesSummary` → `getReservePositions`) recomputes surplus live on every read, but the persisted **RESERVE_TOPUP task** was only refreshed by `recomputeReserveTopupTask` from `set-wallet-balance`, `update-wallet`, `adjust-category-reserve`, `toggle-category-reserve-excluded`, `archive-wallet`, `archive-category`, and the hourly sweep — **not** from the mutations that change `internal` via usage. So the task message went stale until the next reserve-wallet edit or the hourly reconciliation.

`emitReserveTopup` already does `ON CONFLICT … DO UPDATE SET payload_json` and the surplus math is correct; the **only** defect was the missing trigger on usage-driven mutations.

## Failing-test proof (RED)

Three new cases in `packages/budgeting/test/tasks/reserve-topup.test.ts` drive the **use cases** wired with the same reserve-topup deps the factory wires, then assert the persisted task tracks the live engine surplus. Before the fix:

```
Expected: "67200"   ← live banner (672.00) after a 200-spend over a 100-limit draws 100 reserve
Received: "57200"   ← persisted task stuck at the stale baseline 572.00  (the user's exact repro)
(fail) … > a transaction that draws reserve refreshes RESERVE_TOPUP to the live surplus
Received: null      ← editing/deleting never fired recompute → no task at all
(fail) … > editing a transaction to raise the amount draws more reserve and refreshes the task
(fail) … > deleting an overspending transaction returns reserve and refreshes the task
Ran 3 tests across 1 file.  (0 pass / 3 fail)
```

## The fix (GREEN) — files changed + deps threaded

Wired `recomputeReserveTopupTask` (best-effort, own-tx A2 — never fails the user's mutation) into the missing sites, threading **OPTIONAL + gated** deps (`taskRepo?`, `reservePositions?`, `budgetCurrencyOf?`, `isReservesEnabled?`) through `contracts/factory.ts`:

| Use case                              | Why it draws/shifts reserve                     | Wiring                                                         |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `create-transaction.ts`               | overspend → draw (primary gap, user's repro)    | shared `maybeRecomputeReserveTopup` helper, post-commit own-tx |
| `edit-transaction.ts`                 | amount/category change → draw/return            | reuses the shared helper                                       |
| `set-category-limit.ts`               | limit change → effLimit → overage → draw        | alongside the existing CUSHION recompute                       |
| `toggle-budget-mode.ts`               | NORMAL↔CUSHION flips effLimit for limited cats  | post-toggle own-tx                                             |
| `confirm-recurring-draft.ts`          | flips `confirmed_at` → counted spend → may draw | post-confirm own-tx                                            |
| `edit-and-confirm-recurring-draft.ts` | same as above (+ edits)                         | post-confirm own-tx                                            |

`factory.ts`: passed `reservePositions` + `getWorkspaceDefaultCurrency` (as `budgetCurrencyOf`) + `isReservesEnabled` + `createTaskRepo()` to each of the six. Engine, surplus math, and `emitReserveTopup` (DO UPDATE) untouched.

## Choke-point findings (paths that bypass the create/edit/delete use cases)

- **`recurring-engine.ts` (worker)** writes `budgeting.expense_ledger` **directly** (`INSERT … line 178`) as **UNCONFIRMED** drafts. `spendByCategoryByMonth` only counts `confirmed_at IS NOT NULL`, so a generated draft is **not** counted spend and **does not** draw reserve → correctly needs **no** recompute. The later **confirm** is what draws — and confirm is hooked (`confirm-recurring-draft` / `edit-and-confirm-recurring-draft`).
- **`confirm-recurring-draft.ts` / `edit-and-confirm-recurring-draft.ts`** flip `confirmed_at` via direct SQL (no `createTransaction` call) → **now wired**.
- **`bulk-recategorize`** + the route-level **delete/create/edit/confirm** already fire `syncReserveTopup` in `apps/api/src/routes/transactions.ts` (an existing working-tree hook → `factory.recomputeReserveTopup`). Belt-and-suspenders with the new use-case wiring; double-fire is harmless (idempotent DO UPDATE).
- Any remaining direct-write path is **sweep-covered** by the hourly `budgeting-reconciliation` handler (`apps/worker`).

## Test results (RED → GREEN, no regression)

- **05-17 cases:** 0/3 → **3/3 pass.**
- **`reserve-topup.test.ts` full:** **8 pass / 1 skip / 0 fail** (5 original generator cases + 3 new; the 1 skip is the deferred `@budget/worker` sweep test).
- **Reserve regression set** (engine golden + multimonth + disable + get-reserve-positions + reserves-summary-builder + reserves-use-cases): **56 pass / 1 skip / 0 fail.**
- **budgeting `test/tasks/`:** **28 pass / 1 skip / 0 fail.**
- **budgeting src `tsc --noEmit`:** my files **0 errors**; package total **15** — the documented pre-existing baseline, unchanged.

## Live verification (real factory module, user's screenshot scenario)

Booted the **real `createBudgetingModule`** against Postgres and replayed the screenshot scenario (budget "Optimistic Tapo", category "Їжа", reserve 328, RESERVE wallet 900, then overspend the 100-limit by 100):

```
BANNER_BEFORE = 57200   (572.00 WITHDRAW — matches the screenshot "Withdraw 572")
CREATE ok? true         (Used 100 over → draws 100 reserve)
BANNER_AFTER  = 67200   (banner recomputes live to 672.00)
PERSISTED_TASK= 67200/WITHDRAW   ← now MATCHES the banner (was stale at 572 before the fix)
```

(Backend-only change; `api` runs from a prebuilt image but the fix is exercised end-to-end through the actual DI factory wiring against real Postgres, which is stronger than a UI click. Temp repro harness removed after verification.)

## Left to the sweep / pre-existing

- The user's **existing** stale task on budget "Optimistic Tapo" self-corrects on its **next reserve-affecting mutation** or the **next hourly `budgeting-reconciliation` sweep** — no migration/backfill needed.
- **Direct-write recurring materialization** (worker drafts) intentionally relies on the confirm hook + sweep (drafts aren't counted spend).
- `set-category-limit.ts` also carries a **pre-existing working-tree refactor** (`setLimit` → `setLimitForMonth` + `singleMonth`/`carryForward`) that predates this task; only the RESERVE_TOPUP recompute hunks belong to 05-17 (noted in the fix commit body).

## ⚠ Flagged — PRE-EXISTING, OUT OF SCOPE (confirmed identical on clean HEAD)

- `make ci-gate`: **40 pass / 3 fail** — `tests/tenant-leak/tasks-cross-tenant.test.ts` (2) + `cushion-summary-cross-tenant.test.ts` (1). Stashing my changes reproduces the same 3 fails on HEAD. The brief names `tasks-cross-tenant` as out-of-scope; left untouched.
- `apps/api/test/routes/transactions-search.test.ts`: **5 fail** (GET search route → 422). The `search-transactions` route is untouched by this plan; identical failures on clean HEAD. Out of scope (`make test infra debt`).

## Commits

- `7369238` test(05-17): failing repro — transaction-driven reserve draw leaves RESERVE_TOPUP stale
- `0075e91` fix(05-17): refresh RESERVE_TOPUP from every ledger mutation that draws reserve

## Self-Check: PASSED

- Source edits present in all 6 use cases + factory (verified via grep) ✓
- Commits `7369238` + `0075e91` in `git log` ✓
- SUMMARY file written at `.planning/phases/05-reserves-wallets-tabs/05-17-SUMMARY.md` ✓
