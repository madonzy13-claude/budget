---
phase: 07-tasks-queue
plan: 05
subsystem: api
tags: [tasks, reserve-topup, generators, inline-emit, idempotent]

requires:
  - phase: 07-tasks-queue
    provides: "07-02: TaskRepo.emitReserveTopup + resolveByKindAndBudget shipped"
  - phase: 07-tasks-queue
    provides: "07-03: recompute helper pattern (create-or-resolve closure-over-deps)"
provides:
  - "recompute-reserve-topup-task helper: closure-over-deps; compares wallet pool vs category reserve totals; emits CASE shortfall (TOPUP) or excess (WITHDRAW), resolves when balanced"
  - "Inline emit hooks wired into 3 mutation paths: set-wallet-balance, update-wallet, adjust-category-reserve"
  - "5 passing integration tests + 1 todo (sweep deferred to 07-06): emit on mismatch, no-emit on balance, dedup, resolve, cross-tenant isolation"
affects: [07-06, 07-07, 07-10]

tech-stack:
  added: []
  patterns:
    - "Inline emit at mutation site: recomputeReserveTopupTask called after the write, piggybacks tx, emits/resolves atomically with the trigger event"
    - "Mismatch direction: walletPool − totalReserves > 0 → WITHDRAW; < 0 → TOPUP; = 0 → resolve"

key-files:
  created:
    - "packages/budgeting/src/application/recompute-reserve-topup-task.ts"
  modified:
    - "packages/budgeting/src/application/set-wallet-balance.ts"
    - "packages/budgeting/src/application/update-wallet.ts"
    - "packages/budgeting/src/application/adjust-category-reserve.ts"
    - "packages/budgeting/test/tasks/reserve-topup.test.ts"
    - "packages/budgeting/package.json"

key-decisions:
  - "Test seed uses category_reserve_adjustments delta-ledger instead of full category_limits SCD-2 row. Adapter's fallback CTE picks adjustments up; cheaper seed, same expected balance."
  - "Sweep test deferred to 07-06 — sweep handler is 07-06's scope (hourly reconciliation worker), not 07-05's inline-emit scope."

patterns-established:
  - "Inline emit hook lands at the END of each mutation use case (after Result.ok / before route returns); wraps caller's tx so emit + write are atomic."

requirements-completed: [TASK-02]

duration: ~25min
completed: 2026-05-31
---

# Phase 07 Plan 05: RESERVE_TOPUP Generator — 3 Inline Mutation Hooks

**recomputeReserveTopupTask helper wires into set-wallet-balance, update-wallet, adjust-category-reserve; emits RESERVE_TOPUP when wallet-pool vs category-reserve mismatch ≠ 0, resolves when balanced.**

## Performance

- **Duration:** ~25 min (original autonomous run truncated at Task 3 setup; recovered inline)
- **Started:** 2026-05-31T10:43Z
- **Completed:** 2026-05-31T11:10Z (approx)
- **Tasks:** 3 / 3
- **Files modified:** 6

## Accomplishments

- `recompute-reserve-topup-task.ts` helper closure-over-deps; mismatch math via `walletPool − totalReserves`; emits direction TOPUP or WITHDRAW; resolves on balance
- Wired inline emit into 3 mutation paths (set-wallet-balance, update-wallet, adjust-category-reserve) — emits piggyback the caller's tx for atomicity
- 475-line integration test green: 5 pass + 1 todo (sweep test deferred to 07-06)
- Recovery fixes: `package.json` exports updated; test seed `category_reserve_adjustments` column names corrected (`actor_user_id`+`created_at` → `created_by`+`occurred_at`)

## Task Commits

1. **Task 1: Add recompute-reserve-topup-task shared helper** — `96904e8` (feat)
2. **Task 2: Wire RESERVE_TOPUP recompute hook into 3 mutation sites** — `1cada37` (feat)
3. **Task 3: 5-case Nyquist coverage + package.json export + column fixes** — `79723c1` (test)

## Files Created/Modified

- `packages/budgeting/src/application/recompute-reserve-topup-task.ts` — NEW; closure-over-deps recompute helper
- `packages/budgeting/src/application/set-wallet-balance.ts` — inline emit at write boundary
- `packages/budgeting/src/application/update-wallet.ts` — inline emit at write boundary
- `packages/budgeting/src/application/adjust-category-reserve.ts` — inline emit at write boundary
- `packages/budgeting/test/tasks/reserve-topup.test.ts` — REWRITTEN 475-line integration test
- `packages/budgeting/package.json` — added `./src/application/recompute-reserve-topup-task` export

## Decisions Made

- **Seed via adjustments ledger, not SCD-2 category_limits.** Reserve-balance adapter's fallback CTE picks `SUM(delta_cents)` from `category_reserve_adjustments` when no `category_limits` row exists. Cheaper seed for tests; same expected balance.
- **Sweep test deferred to 07-06.** RESERVE_TOPUP sweep is a worker job; 07-06 adds the hourly handler. Inline emit covers all known mutation paths in this plan's scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Env Hygiene] Missing recompute-reserve-topup-task export in package.json**

- **Found during:** Task 3 verify (bun:test module resolution)
- **Issue:** New helper at `src/application/recompute-reserve-topup-task.ts` not listed in `package.json` exports; test import via `@budget/budgeting/src/application/...` failed module resolution.
- **Fix:** Added `"./src/application/recompute-reserve-topup-task": "./src/application/recompute-reserve-topup-task.ts"` next to `recompute-cushion-task` export (alphabetical pre-existed; new export inserted after cushion).
- **Verification:** `bun test` resolved module successfully on retry.
- **Committed in:** `79723c1`

**2. [Rule 1 - Schema Drift] `category_reserve_adjustments` INSERT used non-existent `actor_user_id`+`created_at` columns**

- **Found during:** Task 3 verify (PG error `column "actor_user_id" of relation "category_reserve_adjustments" does not exist`)
- **Issue:** Test seed copied INSERT pattern from `budgeting.categories` (which has `actor_user_id`+`created_at`); `category_reserve_adjustments` uses `created_by`+`occurred_at` per live `\d` inspection.
- **Fix:** Aligned INSERT column list to live schema.
- **Verification:** `\d budgeting.category_reserve_adjustments` shows `created_by uuid` + `occurred_at timestamptz`; test query succeeds.
- **Committed in:** `79723c1`

**3. [Rule 2 - Missing Critical] Truncation recovery from #2410 SSE timeout mid-Task 3 setup**

- **Found during:** Original autonomous run terminated at Task 3 setup phase (~720s / 73 tool uses) before tests ran
- **Issue:** Helper + 3 hook wiring committed (Tasks 1+2); Task 3 test file written but uncommitted + 2 setup defects above unfixed.
- **Fix:** Orchestrator continued interactively from same worktree: committed test with the two column/exports fixes, ran tests green, wrote SUMMARY, merged back.
- **Committed in:** `79723c1` + this SUMMARY commit

---

**Total deviations:** 3 auto-fixed. None changes shipped semantics.
**Impact on plan:** Recovery flow only — same outcome as a single uninterrupted run.

## Issues Encountered

- **#2410 SSE truncation mid-Task 3** — third occurrence of this pattern in Phase 7. Future plans should be even tighter on tool-use count (currently ~70-95 per plan triggers the timeout).
- **Pre-existing `resolve-idempotency.test.ts` failures** flagged by 07-04 remain pre-existing (same RLS BEGIN/COMMIT gotcha from 07-03's patterns-established); follow-up plan recommended.

## Next Phase Readiness

- 07-06 (CUSHION_BELOW_TARGET wiring): can add cushion inline hooks adjacent to the RESERVE_TOPUP hooks in `set-wallet-balance.ts` / `update-wallet.ts` (clear comment markers will need to land in 07-06).
- 07-06 (hourly sweep): can build on the `recomputeReserveTopupTask` helper for the worker handler.
- 07-07 (API): no API surface changes required by RESERVE_TOPUP — emit is fully inline.

---

_Phase: 07-tasks-queue_
_Plan: 05_
_Completed: 2026-05-31_
