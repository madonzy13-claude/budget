---
phase: 07-tasks-queue
plan: 04
subsystem: budgeting
tags: [tasks, recurring-engine, confirm-draft, auto-resolve, hex-boundary]

requires:
  - phase: 07-tasks-queue
    provides: "07-01: 3-kind tasks_kind_chk + tasks_confirm_draft_pending_uq partial unique index on (payload_json->>'draft_id') for CONFIRM_DRAFT dedup"
  - phase: 07-tasks-queue
    provides: "07-02: TaskRepo.emitConfirmDraft + resolveConfirmDraftByDraftId methods (port + Drizzle adapter)"
  - phase: 02-recurring-engine
    provides: "runRecurringEngine handler in apps/worker with insertResult.rows.length > 0 emit gate (Pitfall 3) and per-rule withTenantTx scope"
provides:
  - "Inline CONFIRM_DRAFT emit in recurring-engine on fresh draft INSERT
    (same withTenantTx, gated by rows.length > 0 — Pitfall 3 honoured)"
  - "Auto-resolve hook on confirm-recurring-draft.ts (same tx as
    UPDATE confirmed_at = now()): banner refreshes on next poll"
  - "Auto-resolve hook on skip-recurring-draft.ts (same tx as
    UPDATE deleted_at = now())"
  - "Auto-resolve hook on dismiss-draft.ts via A2 fallback (separate
    withTenantTx because deps.repo.dismiss owns its own tx with
    audit/outbox writes; trade-off documented inline)"
  - "confirm-draft.test.ts — 6 passing integration tests against real
    Postgres covering all VALIDATION.md Nyquist cases for CONFIRM_DRAFT"
affects: [07-05, 07-06, 07-07]

tech-stack:
  added: []
  patterns:
    - "Inline emit inside the trigger event's existing withTenantTx —
      no separate tx opened. Atomicity invariant: a failed task emit
      rolls back the underlying draft INSERT."
    - "Optional `taskRepo` on application factories. When the repo is
      injected, the use case auto-resolves the matching PENDING task in
      the same tx; when omitted, the use case is the legacy v1.0
      behaviour. Compile-time-safe migration path for callers."
    - "A2 fallback for cases where the inner repo owns its own tx —
      open a thin separate withTenantTx after the inner call returns
      `ok`. Tiny race window mitigated by the idempotent UPDATE
      contract on the repo (no-op if already RESOLVED)."

key-files:
  created:
    - "packages/budgeting/test/tasks/confirm-draft.test.ts (508 lines —
      replaces the 47-line Wave 0 scaffold)"
  modified:
    - "apps/worker/src/handlers/recurring-engine.ts (+34 lines: opts
      taskRepo, inline emit inside fresh-INSERT block)"
    - "packages/budgeting/src/application/confirm-recurring-draft.ts
      (deps + auto-resolve)"
    - "packages/budgeting/src/application/skip-recurring-draft.ts
      (deps + auto-resolve)"
    - "packages/budgeting/src/application/dismiss-draft.ts (deps +
      A2 fallback separate-tx resolve)"
    - "packages/budgeting/src/contracts/factory.ts (inject
      createTaskRepo() into confirm + skip factory invocations)"
    - "apps/api/src/boot.ts (inject taskRepo into dismissDraft service
      construction — uses existing taskRepo created for listPendingTasks)"

key-decisions:
  - "rule_name payload field falls back to `rule.note` because the
    live recurring_rules schema has NO `name` column. The plan
    instructions referenced `rule.name` (planning-time text); the
    canonical reader on the same schema uses `note`. Same pattern as
    07-03 (canonical column choice over plan literal text)."
  - "dismiss-draft.ts takes the A2 fallback (separate withTenantTx for
    resolve, after deps.repo.dismiss returns ok) instead of
    refactoring repo.dismiss inline. Reason: the adapter currently
    owns audit + outbox writes inside its own withTenantTx; inlining
    would duplicate that logic in the application file and violate
    hex-purity. The race window is bounded by the idempotent UPDATE
    contract (resolveConfirmDraftByDraftId WHERE status='PENDING' is
    a 0-row no-op if a concurrent confirm already resolved it)."
  - "taskRepo on application deps is OPTIONAL (`taskRepo?: TaskRepo`)
    so legacy callers still compile. Backward-compat path: legacy
    confirmRecurringDraft() with no args is the unchanged v1.0
    behaviour; Phase 7+ callers pass {taskRepo: createTaskRepo()}."
  - "Tests use a relative cross-app import
    `../../../../apps/worker/src/handlers/recurring-engine` for the
    emit cases (1 & 2). Acceptable because cases 1+2 explicitly
    exercise the engine handler end-to-end per
    07-VALIDATION.md acceptance text 'uses the actual handler'."

patterns-established:
  - "Worker handler accepts taskRepo via the existing opts object
    (alongside todayOverride + fxProvider) — default via
    createTaskRepo() factory keeps direct-call tests working without
    changing the call site."
  - "Auto-resolve hook idiom inside an application use case:
    `if (deps.taskRepo) await deps.taskRepo.resolveConfirmDraftByDraftId(
    input.tenantId, input.draftId, drizzleTx as TenantTx)`.
    Placed between the trigger UPDATE and writeAudit so the resolve
    is part of the same atomic write."
  - "Worktree bun-install hygiene: integration tests that dynamically
    `await import('@budget/budgeting/...')` REQUIRE node_modules to
    exist in the worktree (workspace symlinks resolve via
    node_modules/@budget/). Without the install, bun loads stale files
    via filesystem walk-up and tests appear cached as it.todo."

requirements-completed: [TASK-03, TASK-06, TASK-08]

duration: ~22min
completed: 2026-05-31
---

# Phase 07 Plan 04: CONFIRM_DRAFT Generator + Auto-Resolve Hooks

**Recurring-engine emits a CONFIRM_DRAFT task in the same tx as the
expense_ledger draft INSERT (gated by `insertResult.rows.length > 0`);
confirm/dismiss/skip use cases auto-resolve that task in the same
mutation tx so the banner refreshes the moment the user acts. 6 Nyquist
integration tests pass against real Postgres.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-05-31T10:27Z
- **Completed:** 2026-05-31T10:42Z
- **Tasks:** 3 / 3
- **Files modified:** 6 source + 1 test file

## Accomplishments

- `apps/worker/src/handlers/recurring-engine.ts` — emits CONFIRM_DRAFT
  inline inside the existing `if (insertResult.rows.length > 0)` block
  (immediately after `writeOutbox`). Payload contains all 6 fields per
  the port contract: draft_id, rule_name, amount_cents, currency,
  transaction_date, category_id.
- `packages/budgeting/src/application/confirm-recurring-draft.ts` —
  optional `taskRepo: TaskRepo` deps; auto-resolves in the same
  withTenantTx between `UPDATE confirmed_at = now()` and `writeAudit`.
- `packages/budgeting/src/application/skip-recurring-draft.ts` — same
  pattern between `UPDATE deleted_at = now()` and `writeAudit`.
- `packages/budgeting/src/application/dismiss-draft.ts` — A2 fallback
  (deps.repo.dismiss owns its tx; open a separate withTenantTx for
  resolve after `ok` outcome).
- Factory wiring: `packages/budgeting/contracts/factory.ts` passes
  `createTaskRepo()` into confirmRecurringDraft + skipRecurringDraft;
  `apps/api/src/boot.ts` passes the existing taskRepo into dismissDraft.
- `packages/budgeting/test/tasks/confirm-draft.test.ts` — 508 lines
  replacing the 47-line Wave 0 scaffold. 6 Nyquist cases all green
  against real Postgres (DATABASE_URL_APP + DATABASE_URL_WORKER).

## Task Commits

1. **Task 1: Emit CONFIRM_DRAFT inline in recurring-engine** — `2d7edc3` (feat)
2. **Task 2: Wire auto-resolve in confirm/dismiss/skip use cases** — `a6f4962` (feat)
3. **Task 3: Write 6-case confirm-draft.test.ts (Nyquist coverage)** — `831236f` (test)

## Files Created/Modified

- `apps/worker/src/handlers/recurring-engine.ts` — +34 lines: imports
  TaskRepo + TenantTx + createTaskRepo; adds `taskRepo?` to opts; inserts
  `emitConfirmDraft(tenant_id, tenant_id, payload, tx)` call inside the
  existing fresh-INSERT branch.
- `packages/budgeting/src/application/confirm-recurring-draft.ts` — adds
  optional `ConfirmRecurringDraftDeps` shape; calls
  `resolveConfirmDraftByDraftId` in the same drizzleTx.
- `packages/budgeting/src/application/skip-recurring-draft.ts` — adds
  optional `SkipRecurringDraftDeps` shape; same insertion point.
- `packages/budgeting/src/application/dismiss-draft.ts` — adds optional
  `taskRepo` to existing `DismissDraftDeps`; opens separate withTenantTx
  for resolve after `deps.repo.dismiss()` returns `ok`.
- `packages/budgeting/src/contracts/factory.ts` — imports createTaskRepo;
  passes `{ taskRepo: createTaskRepo() }` into the confirm + skip
  factories.
- `apps/api/src/boot.ts` — passes the existing taskRepo (constructed
  for the listPendingTasks read service) into dismissDraft.
- `packages/budgeting/test/tasks/confirm-draft.test.ts` — 508 lines.
  Bootstrap, seed helpers (seedBudgetWithRule, seedDraftRowDirect,
  seedPendingConfirmDraftTask), assertion helpers
  (countPendingConfirmDraftTasks, readPendingConfirmDraftPayload,
  readTaskStatus) — all RLS-safe (BEGIN/COMMIT around set_config).

## Decisions Made

- **`rule.note` is the CONFIRM_DRAFT payload's rule_name fallback.**
  The plan instructions named `rule.name`, but the live
  `budgeting.recurring_rules` schema has no `name` column. Verified
  via `\d budgeting.recurring_rules`: columns are id, tenant_id,
  category_id, amount, currency, cadence, cadence_anchor, weekly_dow,
  note, active, next_due_date, created_at, updated_at, actor_user_id,
  yearly_month. The `note` column is the only user-facing label, so
  rule_name is set to `rule.note ?? ""`. Same pattern as 07-03 (live
  schema vs plan text). UI consumers can render `rule_name` directly.
- **A2 fallback chosen for dismiss-draft.ts.** Plan said either inline
  refactor or A2 fallback. Inline would have required duplicating the
  audit + outbox writes that currently live inside
  `DrizzleExpenseLedgerDraftPortRepo.dismiss()`. A2 keeps the adapter
  authoritative; the trade-off (tiny race window where a concurrent
  resolve could in principle leave the task PENDING for one poll
  cycle) is bounded by the idempotent UPDATE contract (the next
  resolve attempt is a 0-row no-op).
- **Optional `taskRepo` in deps shape, not required.** Keeps the
  application-layer contract back-compat for any caller that still
  invokes `confirmRecurringDraft()` / `skipRecurringDraft()` with no
  args. Phase 7 callers (factory.ts + boot.ts) all pass taskRepo
  explicitly.
- **Cases 1+2 use the actual recurring-engine handler via a relative
  cross-app import.** The plan's acceptance text reads "uses the
  actual handler so the emit path is exercised end-to-end". The
  4-up relative path
  (`../../../../apps/worker/src/handlers/recurring-engine`) is the
  least-friction way to honour that without restructuring the worker
  app into a package.
- **Required env split: DATABASE_URL_APP + DATABASE_URL_WORKER.** The
  engine's step 1 uses `withInfraTx` (worker_role pool); the seed
  helpers use the app_role pool. Both URLs must point to localhost (via
  the `@db: → @localhost:` rewrite). Initial test runs failed with
  "0 emit" because the worker URL pointed to app_role.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Live `budgeting.recurring_rules` has no `name` column**

- **Found during:** Task 1 (authoring the emit payload).
- **Issue:** Plan instructions populated `rule_name` from `rule.name`.
  The live schema has no `name` column; `note` is the closest analog.
- **Fix:** Set `rule_name: rule.note ?? ""`. Documented inline in
  recurring-engine.ts so future reads of the engine code don't try
  to look up rule.name.
- **Files modified:** apps/worker/src/handlers/recurring-engine.ts
- **Committed in:** `2d7edc3`.

**2. [Rule 3 - Blocking] Worktree has no `node_modules` after creation**

- **Found during:** Task 3 (running confirm-draft.test.ts).
- **Issue:** Bun resolved `@budget/budgeting/*` dynamic imports via
  filesystem walk-up to the MAIN repo's `node_modules/@budget/budgeting`,
  which symlinked to the MAIN repo's stale `packages/budgeting/` —
  so bun loaded the Wave 0 scaffold (47 lines, 6 it.todo) instead of
  my updated test file (508 lines, 6 it). Output showed
  `0 pass / 6 todo / Ran 6 tests` with no further diagnostic.
- **Fix:** `bun install` from the worktree root. 1152 packages
  installed in 270ms. Symlink farm now points `node_modules/@budget/`
  back at the worktree's `packages/`.
- **Files modified:** none (workspace install).
- **Verification:** `md5sum` of test file via package path
  (`node_modules/@budget/budgeting/test/tasks/confirm-draft.test.ts`)
  matched the worktree path's md5 after install.
- **Memory note candidate (echoes 07-03):** "Worktree always needs
  bun install before running integration tests."

**3. [Rule 3 - Blocking] DATABASE_URL_WORKER must point to worker_role,
not app_role**

- **Found during:** Task 3 (first integration test run after node_modules
  install — test 1 failed with "Expected 1 / Received 0").
- **Issue:** I initially exported the same DATABASE_URL for both APP
  and WORKER env vars. The engine's step 1 (`withInfraTx` SELECT
  DISTINCT tenant_id) uses the worker pool; if the worker URL points
  to app_role, the SELECT returns 0 rows (worker_role is privileged
  for that scan).
- **Fix:** Used the real `DATABASE_URL_WORKER` from Infisical's dev
  env (worker_role connection string).
- **Files modified:** none (env-only change for the test run).
- **Verification:** Re-ran with both URLs explicitly set → 6/6 pass.

---

**Total deviations:** 3 auto-fixed (1 Rule 1 schema-vs-plan, 2 Rule 3
environment hygiene). None changes the shipped contract or the Phase 7
emit/resolve semantics.

**Impact on plan:** Two echoes of patterns already flagged in 07-03 —
worktree node_modules hygiene + live-schema-vs-plan column names. The
engine code change is small (34 lines) and tsc-clean. The application
file changes preserve back-compat by accepting taskRepo as optional.

## Issues Encountered

- **Pre-existing failures in `resolve-idempotency.test.ts` (3 of 4
  tests).** Out of scope for Plan 04 per the SCOPE BOUNDARY rule —
  these failures existed at the worktree base commit (`8d07717`),
  verified by checking out the base for the test file + dependencies
  and re-running the test alone (3 fail before my changes, 3 fail
  after — identical count). Flagged as `deferred-items`. Failures:
  - `resolve UPDATE matches no rows when task already RESOLVED (no-op)`
  - `resolve UPDATE respects tenant scope (cross-tenant resolve fails)`
  - `resolveConfirmDraftByDraftId scopes by payload_json->>'draft_id' AND tenant_id`
    These are in 07-02's expanded resolve-idempotency.test.ts (283 lines);
    likely related to the RLS gotcha codified in 07-03 (helpers that need
    BEGIN/COMMIT around set_config) but not yet applied to this older
    file.

## Verification

Final gate run:

| Gate                                                                                   | Result                                  |
| -------------------------------------------------------------------------------------- | --------------------------------------- |
| `bunx tsc --noEmit` from packages/budgeting/                                           | 15 errors (matches baseline — zero new) |
| `bunx tsc --noEmit` from apps/worker/                                                  | 0 errors                                |
| `bunx tsc --noEmit` from apps/api/                                                     | 0 errors                                |
| `bun test packages/budgeting/test/tasks/confirm-draft.test.ts`                         | **6 pass / 0 fail / 33 expect()**       |
| `bun test packages/budgeting/test/tasks/cushion-math.test.ts` (regression)             | 9 pass / 0 fail                         |
| `bun test packages/budgeting/test/application/confirm-draft.test.ts` (regression)      | 5 pass / 0 fail                         |
| `bun test packages/budgeting/test/application/list-pending-tasks.test.ts` (regression) | 4 pass / 0 fail                         |

Grep acceptance criteria (Task 2):

- `resolveConfirmDraftByDraftId` present in all three application files (1 hit each).
- `taskRepo` present in all three application files.

Grep acceptance criteria (Task 1):

- `emitConfirmDraft` present in recurring-engine.ts.
- `insertResult.rows.length > 0` gate present.
- `draft_id` payload field present.

## Next Phase Readiness

- **Plan 05 (RESERVE_TOPUP generator):** mirrors this plan exactly —
  emit + resolve hooks on reserve-adjustment use cases. Inline-emit
  inside an existing withTenantTx is the validated pattern.
- **Plan 06 (recompute hooks for cushion):** independent of this plan.
- **Plan 07 (API routes):** POST /tasks/:id/resolve will use the
  existing taskRepo.resolve method (07-02). No new wiring needed.
- **Deferred:** `resolve-idempotency.test.ts` 3 pre-existing failures
  — should be fixed in a small follow-up plan (apply 07-03's
  BEGIN/COMMIT pattern to the older helpers).

## Self-Check: PASSED

Files claimed:

- `apps/worker/src/handlers/recurring-engine.ts` — FOUND (modified
  in `2d7edc3`).
- `packages/budgeting/src/application/confirm-recurring-draft.ts` —
  FOUND (modified in `a6f4962`).
- `packages/budgeting/src/application/skip-recurring-draft.ts` —
  FOUND (modified in `a6f4962`).
- `packages/budgeting/src/application/dismiss-draft.ts` — FOUND
  (modified in `a6f4962`).
- `packages/budgeting/src/contracts/factory.ts` — FOUND (modified
  in `a6f4962`).
- `apps/api/src/boot.ts` — FOUND (modified in `a6f4962`).
- `packages/budgeting/test/tasks/confirm-draft.test.ts` — FOUND
  (508 lines, modified in `831236f`).

Commits claimed:

- `2d7edc3` Task 1 — FOUND in git log.
- `a6f4962` Task 2 — FOUND in git log.
- `831236f` Task 3 — FOUND in git log.

All claims verified against `git log --oneline -5` + filesystem
existence.

---

_Phase: 07-tasks-queue_
_Plan: 04_
_Completed: 2026-05-31_
