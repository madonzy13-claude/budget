---
phase: 07
plan: 10
subsystem: tasks-queue
tags: [phase-7, e2e, gherkin, page-objects, task-banner, i18n]
status: partial-checkpoint
one_liner: Phase 7 final integration — rewrites task-banner.feature for @phase7 emit→action→auto-resolve flow per kind, ships 3 new Page Objects, restores 07-08 i18n keys clobbered by 07-09, defers pre-existing 07-06/07-07 unit/ci-gate failures, and stops at Task 4 human-verify checkpoint (Docker rebuild + UAT).
dependency_graph:
  requires: [07-04, 07-05, 07-06, 07-07, 07-08, 07-09]
  provides:
    - Rewritten task-banner.feature with @phase7 scenarios covering all 3 kinds
    - TaskBannerPo Phase-7 helpers (rowByTitle, assertActionLabel, waitForGone)
    - New Page Objects: ReservesPo, WalletsPo, SettingsPo
    - Restored bdp.tasks.{title,kind,action} i18n keys in EN/PL/UK
    - deferred-items.md documenting pre-existing 07-06/07-07 failures
  affects:
    - Phase-7 closeout — cannot mark ROADMAP Phase 7 complete until the
      10 deferred failures + UAT are resolved
tech_stack:
  added: []
  patterns:
    - playwright-bdd Page Object pattern (fresh-user-per-scenario fixture,
      no raw selectors in step files)
    - SQL seed via tenant-id RLS GUC wrapper (mirrors common-steps.ts)
key_files:
  created:
    - apps/web/e2e/page-objects/ReservesPo.ts
    - apps/web/e2e/page-objects/WalletsPo.ts
    - apps/web/e2e/page-objects/SettingsPo.ts
    - .planning/phases/07-tasks-queue/deferred-items.md
  modified:
    - apps/web/e2e/features/task-banner.feature (rewrite)
    - apps/web/e2e/steps/task-banner.steps.ts (rewrite)
    - apps/web/e2e/steps/common-steps.ts (remove dead step)
    - apps/web/e2e/page-objects/TaskBannerPo.ts (extend)
    - apps/web/messages/en.json (restore 07-08 keys)
    - apps/web/messages/pl.json (restore 07-08 keys)
    - apps/web/messages/uk.json (restore 07-08 keys)
decisions:
  - "i18n keys clobbered by 07-09 restored inline per Rule 1 (auto-fix bug)
    rather than blocking Plan 07-10 on a separate 07-09 rework"
  - "Dedup E2E scenario tagged @skip-phase-07-debt — SQL seed bypasses
    repo-level INSERT ON CONFLICT path; revisit when test seed routes
    through TaskRepo.emit"
  - "Pre-existing 5 packages/budgeting test failures + 5 ci-gate failures
    deferred per SCOPE BOUNDARY — Plan 07-06/07-07 territory"
  - "Phase-3 'action button is disabled' assertion fully removed from
    feature + step file per D-PH7-25 + D-PH7-29"
metrics:
  duration_min: 25
  completed: 2026-05-31
---

# Phase 07 Plan 10: Final E2E Rewrite + Gate Sweep + UAT Summary

Rewrites `apps/web/e2e/features/task-banner.feature` from the Phase-3
disabled-action contract to the Phase-7 enabled-action flow: 9 scenarios
covering RESERVE_TOPUP / CONFIRM_DRAFT / CUSHION_BELOW_TARGET emit →
action → auto-resolve, plus settings months input + mobile sanity. Ships
3 new Page Objects (Reserves, Wallets, Settings) and extends
TaskBannerPo. Restores 16 i18n keys (per locale × 3 locales) that 07-09
clobbered. Logs 10 pre-existing test failures and leaves the plan at
the Task 4 human-verify checkpoint per `autonomous: false`.

## Tasks Executed

| #   | Task                                                                 | Status                        | Commits   |
| --- | -------------------------------------------------------------------- | ----------------------------- | --------- |
| 0   | Restore Phase-7 per-kind i18n keys (Rule 1 fix for 07-09 regression) | done                          | `5b474d6` |
| 1   | Rewrite task-banner.feature + step bindings                          | done                          | `a52a54f` |
| 2   | Page Objects (Reserves/Wallets/Settings + TaskBannerPo extensions)   | done                          | `1670bb1` |
| 2.5 | Log pre-existing failures + dedup skip                               | done                          | `54b7dc5` |
| 3   | Gate sweep                                                           | **partial — see Gate Status** | —         |
| 4   | Human UAT checkpoint                                                 | **awaiting user**             | —         |

## Gate Status

| Gate                                                  | Result      | Detail                                                                                                  |
| ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `cd apps/web && bun run test`                         | **GREEN**   | 397 passed / 44 skipped / 0 failed                                                                      |
| `bun test packages/budgeting/test/tasks/`             | **PARTIAL** | 19 passed, 5 failed (pre-existing — `confirm-draft` + `resolve-idempotency`)                            |
| `make ci-gate` (run as `bun test tests/tenant-leak/`) | **PARTIAL** | 20 passed, 5 failed (pre-existing — `cushion-summary-cross-tenant` + `tasks-cross-tenant` POST resolve) |
| `make test-e2e`                                       | **NOT RUN** | Requires `docker compose build web` against this worktree's i18n fix; reserved for the UAT checkpoint   |

All 10 failures are pre-existing on the pre-07-10 HEAD (`a4cfcf0`) and are
logged in `.planning/phases/07-tasks-queue/deferred-items.md`. Per
`<deviation_rules>` SCOPE BOUNDARY they are deferred to a Phase-7
closeout / hotfix plan, not fixed inline in 07-10.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Restored 07-08 per-kind task i18n keys clobbered by 07-09**

- **Found during:** Task 1 read of `apps/web/messages/en.json`
- **Issue:** Plan 07-09 commit `cd86cc5` replaced the `bdp.tasks` block and
  dropped the 16 keys added by Plan 07-08 commit `3b01f4b`
  (`bdp.tasks.title.{RESERVE_TOPUP,CONFIRM_DRAFT,CUSHION_BELOW_TARGET}`,
  `bdp.tasks.kind.*`, `bdp.tasks.action.*.{label,ariaLabel}`,
  `bdp.tasks.confirmError`). The TaskBannerRow component references these
  keys, so the live banner showed missing-key placeholders instead of
  per-kind titles + action labels.
- **Fix:** Restored from `3b01f4b` for `en.json`, `pl.json`, `uk.json`
- **Files modified:** `apps/web/messages/en.json`, `apps/web/messages/pl.json`, `apps/web/messages/uk.json`
- **Commit:** `5b474d6`

### Skipped (with documented debt)

**1. Dedup scenario — `@skip-phase-07-debt`**

- **Scenario:** `Two emit attempts for the same RESERVE_TOPUP shortfall produce one task`
- **Reason:** SQL seed bypasses the repository-level `INSERT ON CONFLICT DO NOTHING` dedup path. Re-enable by routing the test seed through `TaskRepo.emit` so the partial index + ON CONFLICT is exercised.

### Deferred (out of scope)

10 pre-existing test failures — see `deferred-items.md` for the full list and root-cause notes.

## CHECKPOINT REACHED

**Type:** human-verify (carried through from plan Task 4)
**Plan:** 07-10
**Progress:** Tasks 1–2 + deviation-fixes complete (4 commits in this plan); Task 3 partial; Task 4 awaiting user

### Completed Tasks

| Task       | Name                                        | Commit    | Files                                           |
| ---------- | ------------------------------------------- | --------- | ----------------------------------------------- |
| 0 (Rule 1) | Restore Phase-7 i18n keys                   | `5b474d6` | en/pl/uk.json                                   |
| 1          | Rewrite task-banner.feature + step bindings | `a52a54f` | feature + step + common-steps                   |
| 2          | Extend Page Objects                         | `1670bb1` | TaskBannerPo, ReservesPo, WalletsPo, SettingsPo |
| 2.5        | Log deferred items                          | `54b7dc5` | deferred-items.md                               |

### Checkpoint Details

**Why a checkpoint:** The plan is marked `autonomous: false` and Task 4
is explicitly `type="checkpoint:human-verify"`. Task 3 also requires
running `make test-e2e` against a Docker image freshly rebuilt from this
worktree's i18n fix — the parent stack (running 9 minutes-old images
from before the i18n restore) cannot validate the E2E flow until those
images include the restored keys.

**What you need to do to continue:**

1. **Bring this worktree's i18n fix into the running Docker image.**
   From this worktree:

   ```bash
   docker compose build web api worker
   make restart-web && make restart-api && make restart-worker
   docker compose ps   # all healthy
   ```

2. **Re-run the full gate sweep** (worktree as cwd):

   ```bash
   make test                                  # backend bun:test
   cd apps/web && bun run test && cd ../..    # Vitest (already green)
   make ci-gate                               # tenant-leak (currently 5 pre-existing fails — see deferred-items)
   PLAYWRIGHT_BASE_URL=$(grep APP_URL .env.local | cut -d'=' -f2) make test-e2e
   ```

   The Vitest gate is already green from this run. The bun:test + ci-gate
   gates carry 10 documented pre-existing failures from 07-06/07-07 that
   are out of scope for 07-10.

3. **Walk Task 4 UAT** — the 6 tests + edge-case checks listed under
   `Task 4 [CHECKPOINT]: Human UAT` in `07-10-PLAN.md`.

4. **Decide on closeout:**
   - **All gates green + UAT pass** → mark Phase 7 complete in
     `ROADMAP.md` (`[x]` for the Phase 7 line) and run `state advance-plan`.
   - **Pre-existing failures still present** → open a Phase-7 hotfix
     plan to fix the CONFIRM_DRAFT generator + TaskRepo.resolve adapter
     before closing the phase. Do NOT close Phase 7 with red ci-gate.

### Awaiting

- User to rebuild Docker images with the worktree's i18n fix and run
  `make test-e2e`.
- User to walk through the 6 UAT scenarios in Task 4.
- User to decide on Phase-7 closeout disposition (close now vs. fix the
  10 pre-existing failures first).

## Threat Flags

None. Plan 07-10 only touches E2E features, Page Objects, step bindings,
and i18n JSON — no new network endpoints, auth paths, file access
patterns, or schema changes at trust boundaries.

## Known Stubs

`apps/web/e2e/page-objects/SettingsPo.ts#openCushionSection` is a no-op
for the current Settings layout (the cushion section is rendered
inline). It is kept as a stub so the step file can call it
unconditionally and so the contract remains forward-compatible if/when
the section is wrapped in an accordion. Not a data-flow stub — does not
affect the user-facing flow.

## Self-Check

- `apps/web/messages/en.json` contains `bdp.tasks.title.RESERVE_TOPUP` → FOUND
- `apps/web/messages/pl.json` contains `bdp.tasks.title.RESERVE_TOPUP` → FOUND
- `apps/web/messages/uk.json` contains `bdp.tasks.title.RESERVE_TOPUP` → FOUND
- `apps/web/e2e/features/task-banner.feature` contains `@phase7` → FOUND
- `apps/web/e2e/features/task-banner.feature` contains `CUSHION_BELOW_TARGET` (6×) → FOUND
- `apps/web/e2e/features/task-banner.feature` contains `is disabled` → 0 (cleansed)
- `apps/web/e2e/steps/task-banner.steps.ts` contains `is seeded` → FOUND
- `apps/web/e2e/page-objects/ReservesPo.ts` exists → FOUND
- `apps/web/e2e/page-objects/WalletsPo.ts` exists → FOUND
- `apps/web/e2e/page-objects/SettingsPo.ts` exists → FOUND
- `.planning/phases/07-tasks-queue/deferred-items.md` exists → FOUND
- Commit `5b474d6` exists in `git log` → FOUND
- Commit for feature rewrite exists in `git log` → FOUND (`a52a54f`)
- Commit for Page Objects exists in `git log` → FOUND (`1670bb1`)
- Commit for deferred-items exists in `git log` → FOUND (`54b7dc5`)
- TypeScript compiles for all new e2e files → CLEAN
- Vitest green: 397 passed / 44 skipped / 0 failed → CONFIRMED

## Self-Check: PASSED
