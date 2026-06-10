---
phase: 07-tasks-queue
plan: 01
subsystem: database
tags: [drizzle, postgres, migrations, tasks, cushion]

requires:
  - phase: 03-tasks-banner-shell
    provides: "budgeting.tasks table + read-only TaskRepo (kind enum was 4-kind)"
  - phase: 06-settings-onboarding-share-ui
    provides: "tenancy.budgets.cushion_enabled boolean (Phase 6 added it)"
provides:
  - "3-kind tasks_kind_chk constraint (RESERVE_TOPUP, CONFIRM_DRAFT, CUSHION_BELOW_TARGET) — STALE_WALLET + MONTH_END_REVIEW dropped from v1.1"
  - "tenancy.budgets.cushion_target_months column (INT NOT NULL DEFAULT 6, CHECK 1..60)"
  - "Three partial unique indexes for emit-time dedup: tasks_reserve_topup_pending_uq, tasks_cushion_below_target_pending_uq, tasks_confirm_draft_pending_uq"
  - "Red-phase test scaffolds for all 3 generators + cushion-summary tenant-leak test"
  - "REQUIREMENTS/ROADMAP/v1.1-SPEC reconciled to 3-kind scope"
affects: [07-02, 07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09, 07-10]

tech-stack:
  added: []
  patterns:
    [
      "3-kind tasks_kind_chk",
      "Partial unique indexes for emit dedup",
      "cushion_target_months as user-tunable budget setting",
    ]

key-files:
  created:
    - "drizzle/0026_phase07_tasks_cushion_months.sql"
    - "packages/budgeting/test/tasks/reserve-topup.test.ts"
    - "packages/budgeting/test/tasks/confirm-draft.test.ts"
    - "packages/budgeting/test/tasks/cushion-math.test.ts"
    - "packages/budgeting/test/tasks/resolve-idempotency.test.ts"
    - "tests/tenant-leak/cushion-summary-cross-tenant.test.ts"
  modified:
    - "drizzle/meta/_journal.json"
    - ".planning/REQUIREMENTS.md"
    - ".planning/ROADMAP.md"
    - ".planning/v1.1-SPEC.md"

key-decisions:
  - "Dev DB had 10 stale-kind rows (5 STALE_WALLET + 5 MONTH_END_REVIEW) from prior seed/test runs; plan's 'zero rows' safety assumption empirically false in dev — deleted out-of-band before retrying migration. Production guarantee remains (no code path inserts dropped kinds)."
  - "Migrator image must be rebuilt after authoring new migration (drizzle/ is COPY'd at build time, not volume-mounted)."

patterns-established:
  - "Partial unique index for emit dedup: ON CONFLICT DO NOTHING contracts upstream + WHERE status='PENDING' index downstream"
  - "RED-phase test scaffolds land in Wave 0 of a phase so subsequent waves go green incrementally"

requirements-completed: [TASK-01]

duration: ~45min
completed: 2026-05-31
---

# Phase 07 Plan 01: Schema Foundation + Test Scaffolds + Doc Reconciliation

**Migration 0026 lands the 3-kind tasks_kind_chk constraint, cushion_target_months column, and three partial unique dedup indexes; RED-phase test scaffolds + reconciled requirement docs gate Wave 1+ on green tests.**

## Performance

- **Duration:** ~45 min (across original autonomous run + interactive recovery)
- **Started:** 2026-05-31T09:34Z
- **Completed:** 2026-05-31T09:55Z
- **Tasks:** 4 / 4
- **Files modified:** 11

## Accomplishments

- Drizzle migration 0026 applied: 3-kind constraint replaces 4-kind, `cushion_target_months` column lands NOT NULL DEFAULT 6, three partial unique indexes enforce emit-time dedup at the DB layer
- 5 RED-phase test scaffolds committed (4 per-kind generator tests + 1 cushion-summary tenant-leak test)
- REQUIREMENTS.md, ROADMAP.md, v1.1-SPEC.md reconciled to 3-kind Phase 7 scope (TASK-04 rescoped to CUSHION_BELOW_TARGET, TASK-05 dropped from v1.1)
- Migration applied to live dev Postgres after migrator image rebuild + stale-data cleanup

## Task Commits

1. **Task 1: Author migration 0026 + register journal entry** — `c5c3eb5` (feat)
2. **Task 2: Reconcile REQUIREMENTS/ROADMAP/v1.1-SPEC to 3-kind rescope** — `0e88018` (docs)
3. **Task 3: Scaffold per-kind generator tests + cushion-summary tenant-leak test (RED)** — `3988fb0` (test)
4. **Task 4 [BLOCKING]: Apply migration 0026 to live database** — no commit (DB state change only); verified via `\d budgeting.tasks`, `\d tenancy.budgets`, `\di budgeting.tasks_*_pending_uq`, `drizzle.__drizzle_migrations` count 25 → 26

Worktree merges: `f0ac4ac` (07-01 merge — 2 commits) and the test-scaffolds commit `3988fb0` (added post-merge during interactive recovery).

## Files Created/Modified

- `drizzle/0026_phase07_tasks_cushion_months.sql` — migration: drop 4-kind chk, add 3-kind chk, add cushion_target_months, add 3 partial unique dedup indexes
- `drizzle/meta/_journal.json` — journal entry idx 26 for 0026 (when: 1780220232000)
- `.planning/REQUIREMENTS.md` — TASK-04 rescoped, TASK-05 marked dropped-from-v1.1
- `.planning/ROADMAP.md` — Phase 7 plan count and requirement IDs updated
- `.planning/v1.1-SPEC.md` — 3-kind rescope rationale recorded
- `packages/budgeting/test/tasks/reserve-topup.test.ts` — RED scaffold (Nyquist 6 cases pending)
- `packages/budgeting/test/tasks/confirm-draft.test.ts` — RED scaffold (Nyquist 6 cases pending)
- `packages/budgeting/test/tasks/cushion-math.test.ts` — pure cushion math RED stubs
- `packages/budgeting/test/tasks/resolve-idempotency.test.ts` — resolve idempotency RED scaffold (expanded in 07-02 to 283 lines)
- `tests/tenant-leak/cushion-summary-cross-tenant.test.ts` — cushion-summary cross-tenant leak guard

## Decisions Made

- **Stale-row cleanup out-of-band, migration unchanged.** Dev DB had 10 rows of dropped kinds (5 STALE_WALLET + 5 MONTH_END_REVIEW) from earlier seed/test runs; the migration's `ADD CONSTRAINT tasks_kind_chk` rejected them with PG error `23514`. Plan's "zero rows of dropped kinds exist in any environment" holds for production code paths (no application code ever inserted them — Phase 1 just defined the enum), but does not hold for dev. Deleted offending rows via `DELETE FROM budgeting.tasks WHERE kind IN ('STALE_WALLET','MONTH_END_REVIEW')` before re-running `make migrate`. Migration SQL stays clean for prod.
- **Migrator image rebuilt.** Migrator container COPIES the `drizzle/` folder at build time (not volume-mounted); the first `make migrate` ran the old image and silently skipped 0026 (no error, just no new row in `__drizzle_migrations`). Per project memory `feedback_always_rebuild_web`, ran `docker compose build migrator` before retry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Missing Step] Stale-kind row cleanup before migration**

- **Found during:** Task 4 ([BLOCKING] migration apply)
- **Issue:** Plan declared zero rows of dropped kinds exist; live dev DB had 10. Migration failed with PG `23514` (check constraint violation on `tasks_kind_chk`).
- **Fix:** `DELETE FROM budgeting.tasks WHERE kind IN ('STALE_WALLET','MONTH_END_REVIEW')` (10 rows) before retrying `make migrate`. This is dev-DB hygiene, not a migration change.
- **Files modified:** none (DB state only)
- **Verification:** Second `make migrate` ran clean; `drizzle.__drizzle_migrations` count 25 → 26; all three acceptance queries pass.

**2. [Rule 1 - Missing Step] Migrator image rebuild between Task 1 (author) and Task 4 (apply)**

- **Found during:** Task 4
- **Issue:** Plan did not call out that the migrator image must be rebuilt before applying a new migration. First `make migrate` reported `[migrator] complete` but did not insert row 26 because the container still had the pre-0026 drizzle/ snapshot.
- **Fix:** `docker compose build migrator` before retry.
- **Files modified:** none
- **Verification:** Post-rebuild migrate inserted row 26 into `__drizzle_migrations` and applied all three statement-breakpoints.

---

**Total deviations:** 2 auto-fixed (both [Rule 1 - Missing Step]; one DB hygiene, one CI/image hygiene). Neither changes the shipped migration.
**Impact on plan:** None on scope. Both are operational findings worth surfacing for future migration plans (consider DELETE-first guard in 0027+ migrations that tighten enums; consider `make migrate` Makefile target that always rebuilds migrator first).

## Issues Encountered

- **Original autonomous run truncated mid-stream after Task 2 commit** (#2410 SSE stream idle timeout pattern at ~46 tool uses / 290s). Recovered in interactive mode: scaffolds committed manually, worktree merged back (`f0ac4ac`), Task 4 finished after Docker stack brought up via `make dev`. Worktree branch deleted clean.
- **Wave 1 intra-wave overlap on `resolve-idempotency.test.ts`** between 07-01 (scaffold) and 07-02 (expansion to full RED test). Resolved at merge time by taking 07-02's 283-line expanded version (07-01's 43-line scaffold was the strict subset). Planner should have either (a) assigned the file to one plan only or (b) marked the wave sequential. Flagged for retrospective.

## Next Phase Readiness

- Live DB now accepts INSERTs of `CUSHION_BELOW_TARGET` and SELECTs of `cushion_target_months`. Wave 1+ generator code can target the new schema without false-positive types-only build success.
- Partial unique indexes guarantee `INSERT ... ON CONFLICT DO NOTHING` semantics for emit hooks (07-04, 07-05, 07-06 will rely on them).
- All Wave 0 RED scaffolds in place; Wave 1+ will green them.

---

_Phase: 07-tasks-queue_
_Plan: 01_
_Completed: 2026-05-31_
