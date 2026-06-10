---
phase: 07-tasks-queue
plan: 02
subsystem: database
tags: [drizzle, postgres, tasks, hex-boundary, idempotent-writes]

requires:
  - phase: 07-tasks-queue
    provides: "07-01: 3-kind tasks_kind_chk + cushion_target_months column + 3 partial unique dedup indexes (migration 0026 applied)"
  - phase: 03-tasks-banner-shell
    provides: "TaskRepo read-only port + Drizzle adapter (listPending only)"
provides:
  - "Extended TaskRepo port surface: resolve(), emitReserveTopup(), emitConfirmDraft(), emitCushionBelowTarget(), resolveByKindAndBudget(), resolveConfirmDraftByDraftId()"
  - "TaskRepo Drizzle adapter implementing all write methods — INSERT ON CONFLICT DO NOTHING for emit + idempotent UPDATE WHERE status='PENDING' for resolve"
  - "tasks-schema.ts TS mirror updated to 3-kind CHECK constraint"
  - "resolve-task.ts application service mirroring list-pending-tasks shape (hex boundary)"
  - "TypedSQL coverage: tx parameter required on emit methods, optional on resolve methods (route opens own / hook piggybacks caller tx)"
affects: [07-03, 07-04, 07-05, 07-06, 07-07]

tech-stack:
  added: []
  patterns:
    - "Port extension via optional methods on existing interface (avoids hex boundary churn)"
    - "Adapter emit methods rely on DB-layer partial unique indexes (no client-side dedup)"
    - "Idempotent resolve UPDATE: WHERE status='PENDING' makes re-resolves no-op rather than error"

key-files:
  created:
    - "packages/budgeting/src/application/resolve-task.ts"
  modified:
    - "packages/budgeting/src/adapters/persistence/tasks-schema.ts"
    - "packages/budgeting/src/ports/task-repo.ts"
    - "packages/budgeting/src/adapters/persistence/task-repo.ts"
    - "packages/budgeting/test/tasks/resolve-idempotency.test.ts"
    - "packages/budgeting/test/application/list-pending-tasks.test.ts"
    - "packages/budgeting/test/tasks/cushion-math.test.ts"
    - "packages/budgeting/test/tasks/reserve-topup.test.ts"
    - "packages/budgeting/test/tasks/confirm-draft.test.ts"

key-decisions:
  - "Phase 7 write methods kept on the existing TaskRepo port (not split into TaskWriter) — avoids dual-port plumbing for Wave 2+ generators."
  - "tx parameter: required on emit methods (always called from inside an existing withTenantTx so generators run inside the trigger event's tx), optional on resolve methods (route opens its own; auto-resolve hooks piggyback caller's tx for atomicity)."
  - "Wired list-pending-tasks.test.ts makeRepo() to stub all new port methods rather than splitting port — preserves Phase 3 test contract while unblocking tsc post-extension."

patterns-established:
  - "Emit-time dedup: `INSERT ... ON CONFLICT DO NOTHING` on three partial unique indexes (per-kind PENDING). Generators upstream rely on this contract."
  - "Idempotent resolve: `UPDATE ... WHERE tenant_id = $1 AND id = $2 AND status = 'PENDING'`. Already-RESOLVED + cross-tenant rows silently no-op (zero rows updated)."

requirements-completed: [TASK-01, TASK-06]

duration: ~30min
completed: 2026-05-31
---

# Phase 07 Plan 02: TaskRepo Write Surface + resolve-task Application Service

**TaskRepo gains 6 write methods (3 emit + 3 resolve variants) backed by DB-layer partial unique dedup indexes + idempotent UPDATE; resolve-task.ts application service mirrors list-pending-tasks closure-over-deps shape.**

## Performance

- **Duration:** ~30 min (across original autonomous run + interactive recovery)
- **Started:** 2026-05-31T09:34Z
- **Completed:** 2026-05-31T10:00Z
- **Tasks:** 3 / 3
- **Files modified:** 9

## Accomplishments

- TaskRepo port extended with 6 new methods: `resolve`, `emitReserveTopup`, `emitConfirmDraft`, `emitCushionBelowTarget`, `resolveByKindAndBudget`, `resolveConfirmDraftByDraftId`
- TaskRepo Drizzle adapter implements all write methods with per-kind dedup contracts (ON CONFLICT DO NOTHING) and idempotent resolves
- `tasks-schema.ts` TS mirror updated to 3-kind CHECK to match live DB (migration 0026)
- `resolve-task.ts` application service created — closure-over-deps shape, zero persistence/HTTP imports
- Adapter test file `resolve-idempotency.test.ts` expanded from 43-line RED scaffold to 283-line full test (emit dedup, resolve idempotency, cross-tenant defense)

## Task Commits

1. **Task 1: Update tasks-schema.ts TS mirror + extend TaskRepo port** — `1531edf` (feat)
2. **Task 2: Implement TaskRepo adapter write methods (emit + resolve)** — `9df301a` (feat)
3. **Task 3: Create resolve-task.ts application service + scaffold regression fixes** — `59845ed` (feat)

Worktree merge: `0ff87a8` (07-02 worktree merge, conflict-resolved on `resolve-idempotency.test.ts` taking the expanded version).

## Files Created/Modified

- `packages/budgeting/src/ports/task-repo.ts` — added 6 write method signatures, per-kind Payload interfaces
- `packages/budgeting/src/adapters/persistence/task-repo.ts` — added emit + resolve implementations (160 insertions)
- `packages/budgeting/src/adapters/persistence/tasks-schema.ts` — 3-kind CHECK
- `packages/budgeting/src/application/resolve-task.ts` — new application service
- `packages/budgeting/test/tasks/resolve-idempotency.test.ts` — expanded RED scaffold to 283-line full test
- `packages/budgeting/test/application/list-pending-tasks.test.ts` — `makeRepo()` stubs all new TaskRepo methods; `STALE_WALLET` refs → `CUSHION_BELOW_TARGET`
- `packages/budgeting/test/tasks/{cushion-math,reserve-topup,confirm-draft,resolve-idempotency}.test.ts` — `it.todo(desc)` single-arg → 2-arg with empty callback (bun:test type guard)

## Decisions Made

- **Extend existing TaskRepo port instead of splitting into TaskWriter.** Wave 2+ generators need both read and write access in the same transaction; splitting would require dual-port wiring across boot.ts, route handlers, and 5+ generator files. Marginal hex-purity gain not worth the plumbing cost in a single-context bounded write surface.
- **tx parameter mixed-mode (required on emit, optional on resolve).** Emit always fires from inside an event-handling tx (trigger event + emit live in the same atomic write); resolve fires from a fresh HTTP route (which opens its own) OR from an auto-resolve inline-emit hook (which piggybacks the caller's tx). This avoids forcing the route handler to open a useless wrapping tx just to satisfy a required parameter.
- **Pre-existing list-pending-tasks.test.ts stubs broke after port extension** — patched the `makeRepo()` helper to stub all new methods as no-ops. Trade-off: tests now have to thread through `makeRepo()` instead of constructing repo literals, but the helper was already there and three of the four tests used it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Missing Step] 07-01 scaffold compile errors caused by `it.todo` single-arg form**

- **Found during:** Task 3 verify (tsc gate)
- **Issue:** bun:test's `it.todo` requires 2-3 arguments (description + callback + optional timeout); 07-01 wrote single-arg form which fails tsc. All 4 scaffold files affected (~16 errors).
- **Fix:** sed-replace `it.todo("desc")` → `it.todo("desc", () => {})` across `cushion-math.test.ts`, `reserve-topup.test.ts`, `confirm-draft.test.ts`, `resolve-idempotency.test.ts`.
- **Files modified:** 4 test scaffolds in `packages/budgeting/test/tasks/`
- **Verification:** `bunx tsc --noEmit` from `packages/budgeting/` clears all `test/tasks/` errors.
- **Committed in:** `59845ed`

**2. [Rule 2 - Missing Critical] Pre-existing test breakage from TaskRepo port extension**

- **Found during:** Task 3 verify (tsc gate)
- **Issue:** Phase 3's `list-pending-tasks.test.ts` constructed `TaskRepo` literals stubbing only `listPending`. After Task 1's port extension added 5 new required methods, all `TaskRepo` literals fail tsc with "missing properties" errors.
- **Fix:** Updated `makeRepo()` helper to stub all 6 new methods as `async () => {}`. Switched line 99's `const repo: TaskRepo = { listPending }` literal to `makeRepo({ listPending })`. Also replaced two `STALE_WALLET` references with `CUSHION_BELOW_TARGET` (3-kind compliant).
- **Files modified:** `packages/budgeting/test/application/list-pending-tasks.test.ts`
- **Verification:** Phase 7 surface tsc-clean; 15 pre-existing non-Phase-7 errors (Frankfurter, category-domain, budget-template-apply, share-overrides, get-budget-home-summary, reserves-use-cases) remain — see `project_make_test_infra_debt` memory.
- **Committed in:** `59845ed`

**3. [Rule 1 - Missing Step] Verify-grep false positive on "hono" in module comment**

- **Found during:** Task 3 verify (`grep -c "drizzle-orm\|hono"`)
- **Issue:** Original module comment used the literal phrase "NO hono" which the plan's hex-boundary grep flagged.
- **Fix:** Reworded comment to "no persistence-adapter imports, no HTTP-framework imports" — same intent, no false-positive grep match.
- **Files modified:** `packages/budgeting/src/application/resolve-task.ts`
- **Committed in:** `59845ed`

---

**Total deviations:** 3 auto-fixed. None changes the shipped contract or scope.
**Impact on plan:** Two of three are unblocking fixes for upstream-plan defects (07-01 scaffolds, Phase 3 test); one is a comment reword for grep hygiene.

## Issues Encountered

- **Original autonomous run truncated mid-stream after Task 2 commit** (#2410 SSE stream idle timeout pattern at ~65 tool uses / 425s; same pattern hit 07-01). Recovered in interactive mode: adapter changes committed manually as Task 2, resolve-task.ts authored, regression fixes added, worktree merged back (`0ff87a8`), worktree branch deleted clean.
- **`resolve-idempotency.test.ts` add/add conflict at worktree merge.** 07-01 had committed a 43-line RED scaffold (declared in its `files_modified`); 07-02 wrote a 283-line expansion of the same file (NOT declared in its `files_modified` — planning defect). Resolved by taking 07-02's version (strict superset). Flagged for retrospective: planner should either (a) assign shared files to a single plan or (b) mark the wave sequential.

## Next Phase Readiness

- 07-03 (cushion math) can call `taskRepo.emitCushionBelowTarget(...)` and `taskRepo.resolveByKindAndBudget(...)` against a live DB-backed contract.
- 07-04 (CONFIRM_DRAFT generator) can call `emitConfirmDraft` + `resolveConfirmDraftByDraftId`.
- 07-05 (RESERVE_TOPUP generator) can call `emitReserveTopup` + `resolveByKindAndBudget`.
- 07-07 (API routes) will wire `resolveTask({ taskRepo })` into `apps/api/src/boot.ts` next to `listPendingTasks` and expose POST `/budgets/:id/tasks/:taskId/resolve`.

---

_Phase: 07-tasks-queue_
_Plan: 02_
_Completed: 2026-05-31_
