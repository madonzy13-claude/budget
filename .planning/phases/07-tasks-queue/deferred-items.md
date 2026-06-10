# Phase 07 Deferred Items — found during Plan 07-10 execution

## Pre-existing bun:test failures (out of scope for 07-10)

Detected via `bun test packages/budgeting/test/tasks/` and `bun test tests/tenant-leak/` against the worktree pinned at `a4cfcf0` (post-07-09 baseline). These failures persist on the committed-but-clean tree BEFORE any 07-10 edit. They are NOT caused by Plan 07-10 changes and per `<deviation_rules>` SCOPE BOUNDARY they are logged here rather than fixed inline.

### packages/budgeting/test/tasks/ — 5 failures

1. `CONFIRM_DRAFT generator > emits on fresh draft INSERT (recurring-engine handler)` — recurring-engine `seedDraftRowDirect` path no longer emits the CONFIRM_DRAFT task. Likely caused by a recurring-engine refactor in 07-06.
2. `CONFIRM_DRAFT generator > does not emit on conflict (draft already existed for that rule+date)` — same root cause as #1.
3. `TaskRepo adapter — resolve idempotency > resolve UPDATE matches no rows when task already RESOLVED (no-op)` — Plan 07-07 territory.
4. `TaskRepo adapter — resolve idempotency > resolve UPDATE respects tenant scope (cross-tenant resolve fails)` — Plan 07-07 territory.
5. `TaskRepo adapter — resolve idempotency > resolveConfirmDraftByDraftId scopes by payload_json->>'draft_id' AND tenant_id` — Plan 07-07 territory.

### tests/tenant-leak/ (ci-gate) — 5 failures

1. `GET /budgets/:id/cushion-summary tenant isolation > (unnamed)` — `cushion-summary-cross-tenant.test.ts` shipped in 07-07 but assertions don't match runtime route behavior.
2. `(unnamed)` (cushion-summary nested case) — same root cause.
3. `tasks POST resolve cross-tenant gate > Layer 2: createTaskRepo().resolve called with budgetB tenant scope leaves budgetA's task PENDING` — Plan 07-07 territory.
4. `tasks POST resolve cross-tenant gate > Layer 2 sanity: same call with tenantId === budgetA resolves the task` — Plan 07-07 territory.
5. `(unnamed)` (tasks-resolve nested case) — same root cause.

### Action

Open a follow-up plan in Phase 07 (or hotfix branch) to fix the CONFIRM_DRAFT generator and resolve-idempotency adapter so all 10 listed cases pass before Phase 7 is closed in ROADMAP. The Plan 07-10 verifier should NOT mark Phase 7 complete until these are green.

## Dedup E2E scenario — @skip-phase-07-debt

`Scenario: Two emit attempts for the same RESERVE_TOPUP shortfall produce one task` in `apps/web/e2e/features/task-banner.feature` is tagged `@skip-phase-07-debt` because the SQL seed helper bypasses the repository-level `INSERT ON CONFLICT DO NOTHING` dedup path. Re-enable once the dedup-aware repository helper is exposed to E2E (refactor the test seed to go through `TaskRepo.emit` rather than raw SQL).

## i18n key regression fixed inline (Rule 1)

Plan 07-09 (cd86cc5) clobbered the `bdp.tasks.{title,kind,action,confirmError}` keys added in Plan 07-08 (3b01f4b). Restored from 3b01f4b for EN/PL/UK as Plan 07-10 commit `5b474d6`. Tracked here so the verifier knows this happened and ROADMAP can note the regression-fix.
