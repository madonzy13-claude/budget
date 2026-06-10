---
phase: 03-navigation-home-bdp-frame
plan: 03
subsystem: api
tags: [hono, drizzle, postgres, rls, tasks, bdp-03, hex-architecture, tdd, zod]

# Dependency graph
requires:
  - phase: 03-navigation-home-bdp-frame/01
    provides: React Query provider mounted in locale layout; phase-3 e2e scaffolding
  - phase: 03-navigation-home-bdp-frame/02
    provides: BudgetHomeSummaryRepo + /budgets/:id/home-summary surface; canonical v1.1 idiom `tenantId = budgetId`
  - phase: 01-budget-rename-rls-stack
    provides: budgeting.tasks table (MIG-08) with tasks_tenant_isolation RLS policy + (budget_id, status) composite index
provides:
  - TaskRepo port + TaskSummary/TaskKind/TaskStatus types (read-only, Phase 7 will extend)
  - listPendingTasks application service (port-based, hex-compliant)
  - DrizzleTaskRepo adapter (withTenantTx, RLS-scoped SELECT against budgeting.tasks)
  - GET /budgets/:budgetId/tasks?status=pending Hono sub-router mounted in app.ts
  - ListPendingTasksResponse + TaskSummaryResponse + TaskKind wire DTOs in @budget/identity contracts
  - BDP-03 backend shell ready for the banner read path (D-PH3-13 dependency unblocked)
affects: [03-04, 03-05, 03-06, 03-07, 07-tasks-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only port + adapter + service trio for new bounded-context read paths (mirrors HOME-02 BudgetHomeSummaryRepo trio)"
    - "Hono sub-router mounted with a path-param prefix: app.route('/budgets/:budgetId/tasks', createTasksRoute(deps)) reads c.req.param('budgetId') inside the sub-router"
    - "Tenant defence-in-depth: route asserts c.get('tenantIds').includes(budgetId) → 404 (Layer 1); adapter scopes RLS GUC via withTenantTx (Layer 2)"
    - "Tenant-leak gate file-per-endpoint: every new tenant-scoped read endpoint adds exactly one tests/tenant-leak/*.test.ts (BDP-03 increments 6 → 7 files)"

key-files:
  created:
    - "packages/budgeting/src/ports/task-repo.ts (type-only port, ENGR-02 clean)"
    - "packages/budgeting/src/application/list-pending-tasks.ts (port-based service, ENGR-02 clean)"
    - "packages/budgeting/src/adapters/persistence/task-repo.ts (Drizzle adapter, withTenantTx)"
    - "packages/budgeting/test/application/list-pending-tasks.test.ts (4 unit cases, mocked port)"
    - "apps/api/src/routes/tasks.ts (createTasksRoute factory)"
    - "apps/api/test/routes/tasks.test.ts (6 integration cases, real Postgres)"
    - "tests/tenant-leak/tasks-cross-tenant.test.ts (3 cases, RLS layer-2 enforcement)"
  modified:
    - "apps/api/src/app.ts (mount tasks sub-router under /budgets)"
    - "apps/api/src/boot.ts (wire createTaskRepo + listPendingTasks into BootedDeps.budgeting)"
    - "packages/identity/src/contracts/api.ts (export TaskKind/TaskSummaryResponse/ListPendingTasksResponse)"
    - "packages/budgeting/package.json (register new subpath exports)"

key-decisions:
  - "Tasks sub-router uses app.route('/budgets/:budgetId/tasks', createTasksRoute(deps)) instead of inlining handlers in budgetsRoutesFactory — keeps Phase 7's POST/PATCH/DELETE additions in one file"
  - "Phase 3 ships read-only TaskRepo port; Phase 7 will extend the same port with resolve/snooze writes without reshaping the read surface"
  - "Adapter filters BOTH budget_id AND tenant_id in the WHERE clause even though v1.1 invariant guarantees equality — defends against a future schema split (tenant ≠ budget)"
  - "Tasks route mounted under /budgets/* requireAuth fence only (no requireWorkspace) because the handler's tenantIds-membership assertion returns 404 on the empty-tenant case anyway"
  - "Contract types live in @budget/identity/contracts/api.ts alongside HomeSummaryResponse (not in @budget/budgeting/contracts) to match where apps/web imports its wire DTOs from in 03-02"

patterns-established:
  - "TDD red→green for cross-task wiring: Task 2 lands the integration test FIRST (RED — route not yet wired) and Task 3 makes it GREEN. Bun's import-time module resolution provides the RED gate naturally."
  - "ci-gate count discipline: every new tenant-scoped endpoint ships a dedicated tests/tenant-leak/<endpoint>-cross-tenant.test.ts that exercises Layer 2 (RLS) in isolation from Layer 1 (route)."

requirements-completed: [BDP-03]

# Metrics
duration: 32min
completed: 2026-05-12
---

# Phase 03 Plan 03: BDP-03 Tasks Banner Backend Shell Summary

**Read-only `GET /budgets/:budgetId/tasks?status=pending` end-to-end — Drizzle adapter on `budgeting.tasks` (RLS-scoped via withTenantTx), port-based listPendingTasks service, Hono sub-router with zValidator literal-pending guard, and `ListPendingTasksResponse` contract type wired through `@budget/identity`.**

## Performance

- **Duration:** ~32 min
- **Started:** 2026-05-12T22:55Z
- **Completed:** 2026-05-12T23:27Z
- **Tasks:** 3
- **Files created:** 7
- **Files modified:** 4
- **Tests added:** 13 (4 unit + 6 integration + 3 tenant-leak)

## Accomplishments

- TaskRepo port + TaskKind/TaskStatus/TaskSummary types committed to packages/budgeting/src/ports (type-only, zero drizzle/hono imports — ENGR-02 invariant honoured for new code)
- listPendingTasks application service composes through the port and wraps the call in Result<TaskSummary[], Error>
- DrizzleTaskRepo adapter executes a single RLS-scoped SELECT (`withTenantTx`, `status = 'PENDING'`, ASC by `created_at`) and maps rows to TaskSummary with ISO-8601 timestamps
- GET /budgets/:budgetId/tasks?status=pending is live in apps/api — returns `{budgetId, tasks: TaskSummary[]}` on success, 404 on cross-tenant access, 4xx on missing/invalid `?status`, 401 unauthenticated
- Banner read path is now real — Plan 03-06 RSC initial fetch can hit a working backend that returns an empty list today and any rows Phase 7 generators will produce later
- Tenant-leak CI gate count grows from 6 → 7 files (32 pass / 0 fail across the full tenant-leak suite); the new layer-2 test seeds a task in budgetA and confirms the adapter returns [] when the GUC is scoped to budgetB

## Task Commits

Each task was committed atomically (Conventional Commits, Co-Authored-By trailer):

1. **Task 1: TaskRepo port + listPendingTasks service + 4 unit cases** — `5f85e4d` (feat)
2. **Task 2: DrizzleTaskRepo adapter + 6 route integration cases (RED) + tenant-leak gate increment** — `12eac83` (feat)
3. **Task 3: createTasksRoute + mount in app.ts + boot wiring + identity contract DTOs (GREEN)** — `ed95654` (feat)

**Plan metadata:** _(separate `docs(03-03):` commit follows this SUMMARY)_

## Files Created/Modified

### Created

- `packages/budgeting/src/ports/task-repo.ts` — type-only port; exports `TaskRepo`, `TaskSummary`, `TaskKind`, `TaskStatus`
- `packages/budgeting/src/application/list-pending-tasks.ts` — port-based service returning `Result<TaskSummary[], Error>`
- `packages/budgeting/src/adapters/persistence/task-repo.ts` — Drizzle adapter via `withTenantTx`; SQL: `SELECT … FROM budgeting.tasks WHERE budget_id = $1::uuid AND tenant_id = $2::uuid AND status = 'PENDING' ORDER BY created_at ASC`
- `packages/budgeting/test/application/list-pending-tasks.test.ts` — 4 cases against a mocked TaskRepo (empty, ordered, error, args forwarded)
- `apps/api/src/routes/tasks.ts` — `createTasksRoute(deps)` factory; literal `status=pending` zValidator; tenantIds-membership 404 guard; calls `deps.budgeting.listPendingTasks({tenantId, budgetId})`
- `apps/api/test/routes/tasks.test.ts` — 6 integration cases (empty / 3-row ASC / filters RESOLVED / ?status=foo 4xx / missing-status 4xx / cross-tenant 404) against real Postgres
- `tests/tenant-leak/tasks-cross-tenant.test.ts` — 3 layer-2 cases (RLS cross-tenant SELECT returns 0 rows, adapter returns [] when GUC mis-scoped, sanity row returned when GUC correct)

### Modified

- `apps/api/src/app.ts` — `app.route("/budgets/:budgetId/tasks", createTasksRoute(deps))` after `/budgets` mount (under the existing `/budgets/*` requireAuth fence)
- `apps/api/src/boot.ts` — imported `createTaskRepo` + `listPendingTasks`; extended `BootedDeps.budgeting` shape; `Object.assign` wired the service alongside HOME-02's `getBudgetHomeSummary`
- `packages/identity/src/contracts/api.ts` — added `TaskKind`, `TaskSummaryResponse`, `ListPendingTasksResponse`
- `packages/budgeting/package.json` — registered three new subpath exports (`./src/ports/task-repo`, `./src/adapters/persistence/task-repo`, `./src/application/list-pending-tasks`)

## Decisions Made

- **Tasks as a separate sub-router, not inlined in budgetsRoutesFactory** — keeps Phase 7's POST/PATCH/DELETE additions in `apps/api/src/routes/tasks.ts` instead of bloating the budgets file. Matches the wallets/categories/recurring-rules pattern.
- **Filter both `budget_id` AND `tenant_id` in SQL** — v1.1 invariant says they are equal, but writing both bind sites guards against a future schema split. RLS does the heavy lifting (`tenant_id = ANY(app.tenant_ids)`); the `budget_id` predicate is the application-level filter.
- **Skip requireWorkspace middleware on `/budgets/:budgetId/tasks`** — the handler already 404s when `tenantIds` is empty or budgetId is absent. Adding `requireWorkspace` would change the failure mode (403 vs 404) and leak the existence of restricted endpoints.
- **Bunyan `RED → GREEN` across two task commits** — Task 2 commits the integration test against a route that doesn't yet exist (RED via Bun's import-time resolution); Task 3 wires the route and the test becomes GREEN. This satisfies CLAUDE.md's TDD-first rule even though Task 2's `<verify>` block in the plan literally requires the test to pass — see Deviation 1.
- **`Record<string, unknown>` payload in the contract type** — Phase 7 generators will populate `payload_json` per task kind. Keeping the contract opaque now means Phase 7 can ship per-kind payload schemas without a breaking change on this surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Tenant-leak file lives under `tests/tenant-leak/`, not `apps/api/test/security/`**

- **Found during:** Task 2 (writing the tenant-leak case)
- **Issue:** Plan instructs to modify `apps/api/test/security/tenant-leak.test.ts`. That directory does not exist; the actual gate suite lives at `tests/tenant-leak/` (one file per scenario, runner script `scripts/ci/run-tenant-leak.sh` consumed by `make ci-gate`). 03-02's SUMMARY (and its leak file at `tests/tenant-leak/home-summary-cross-tenant.test.ts`) confirmed this layout.
- **Fix:** Added a NEW file `tests/tenant-leak/tasks-cross-tenant.test.ts` modelled exactly on `home-summary-cross-tenant.test.ts`. SPIRIT of the gate is preserved — one new file per new tenant-scoped endpoint.
- **Files modified:** `tests/tenant-leak/tasks-cross-tenant.test.ts` (created)
- **Verification:** `make ci-gate` ran the full suite — 32 pass / 0 fail across 7 files.
- **Committed in:** `12eac83`

**2. [Rule 3 — Blocking] tenant-leak baseline is 6 → 7 files, not the plan's "7 → 8"**

- **Found during:** Task 2 (writing leak case header comments)
- **Issue:** Plan claims this plan increments the gate from 7 to 8. Reality (confirmed by `ls tests/tenant-leak/`): before 03-03 the suite had 6 files (force-rls, in-process-bus, job-without-tenant, no-guc, pg-roles, home-summary). 03-02's own SUMMARY documents the 5 → 6 increment, contradicting the plan's "7" baseline.
- **Fix:** Header comment and SUMMARY both record the real 6 → 7 transition. SPIRIT of the gate ("each tenant-scoped endpoint adds exactly one leak test") is honoured.
- **Verification:** `bun test tests/tenant-leak/` reports `Ran 32 tests across 7 files` post-change (was 29 across 6 files pre-change).
- **Committed in:** `12eac83`

**3. [Rule 3 — Blocking] Subpath imports require `package.json` `exports` registration**

- **Found during:** Task 2 (first invocation of `import("@budget/budgeting/src/adapters/persistence/task-repo")` in the leak test)
- **Issue:** New port/adapter/service files were not resolvable by Bun until registered in `packages/budgeting/package.json` `"exports"`. Other adapters (e.g. reserve-balance-repo, budget-home-summary-repo) are individually listed there.
- **Fix:** Added three subpath entries (`./src/ports/task-repo`, `./src/adapters/persistence/task-repo`, `./src/application/list-pending-tasks`).
- **Verification:** All 13 new tests (4 unit + 6 integration + 3 leak) resolve their imports and pass.
- **Committed in:** `12eac83`

**4. [Rule 2 — Missing critical] Task 2's `<verify>` block cannot pass without Task 3's route**

- **Found during:** Task 2 commit prep
- **Issue:** The plan's Task 2 `<verify>` says `bun test apps/api/test/routes/tasks.test.ts && bun test apps/api/test/security/tenant-leak.test.ts` must exit 0. But Task 2 only creates the adapter and the integration test — the route (Task 3) is what makes the integration test pass. Strict reading of `<verify>` is impossible.
- **Fix:** Honoured CLAUDE.md TDD-first ("write the failing test before writing implementation. No exceptions.") — Task 2 commits the integration test in RED state; Task 3's commit makes it GREEN. Final state: all 6 cases pass.
- **Verification:** After Task 3: `bun test apps/api/test/routes/tasks.test.ts` = 6 pass / 0 fail; `bun test tests/tenant-leak/` = 32 pass / 0 fail across 7 files.
- **Committed in:** `12eac83` (RED) + `ed95654` (GREEN)

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing critical). No Rule 4 architectural checkpoints.
**Impact on plan:** All deviations are paperwork-style mismatches between plan text and the codebase as it actually exists after 03-02. The SPIRIT of every plan requirement is preserved (port + adapter + service + sub-router + tenant-leak increment + contract types).

## Issues Encountered

- **`bun test` exits 1 even when all tests pass.** Coverage threshold of 80% in `bunfig.toml` is enforced per-run; running a single test file in isolation never reaches the threshold and triggers a non-zero exit. Confirmed pre-existing (same artifact present in 03-02's runs). The gate itself is green — 32 pass / 0 fail in the tenant-leak suite, 6 pass / 0 fail in the route integration suite, 4 pass / 0 fail in the unit suite. No regression introduced.
- **Hono `app.route('/budgets/:budgetId/tasks', subRouter)` parameter resolution.** The sub-router reads `c.req.param('budgetId')` to retrieve the path param set on the parent context. Verified by integration test (`fixA.budgetId` round-trips through the URL into the response `budgetId` field).

## Threat Surface Scan

No new threat surface introduced beyond what the plan's `<threat_model>` already enumerates (T-03-03-01 through T-03-03-07). All `mitigate` dispositions implemented:

- T-03-03-01 (auth gate): handler returns 401 if `c.get('session')` is absent.
- T-03-03-02 (tampered `:budgetId`): handler returns 404 unless `tenantIds.includes(budgetId)`.
- T-03-03-03 (cross-tenant disclosure): tenant-leak case proves layer-2 RLS filters cross-tenant rows even if layer-1 is bypassed.
- T-03-03-05 (status tampering): `z.literal('pending')` rejects anything else with a 4xx.
- T-03-03-06 (SQL injection): `sql\`…\``template parameterises binds with`::uuid` casts.

No `accept` dispositions changed.

## Next Plan Readiness

- BDP-03 backend shell is live; Plan 03-06 (BDP layout RSC initial fetch) can call `fetch('/budgets/:id/tasks?status=pending')` and get a real (possibly empty) response.
- Phase 7 task generators can write rows to `budgeting.tasks` (RLS-scoped via `withTenantTx`) and they will surface through this endpoint without code changes.
- No blockers for downstream plans.

## TDD Gate Compliance

Plan was `type: execute` (not `type: tdd`), but both `tdd="true"` tasks (Task 1, Task 2) followed the RED → GREEN cycle correctly:

- Task 1 RED: `bun test packages/budgeting/test/application/list-pending-tasks.test.ts` failed with "Cannot find module" (unit test file written before service file) — verified before commit.
- Task 1 GREEN: same command after writing service + port → 4 pass / 0 fail. Committed as `feat(03-03)` (the test + implementation landed atomically; a separate `test(...)` commit would have been a noise in a 3-task plan).
- Task 2 RED → Task 3 GREEN: the integration test was committed under Task 2 while the route did not yet exist (Bun's import resolution provided the natural RED gate); Task 3's route commit made the test GREEN.

## Self-Check: PASSED

All 11 files referenced in `key-files` exist on disk; all 3 task commits resolve in `git log`. Test suites verified GREEN end-to-end (4 unit + 6 integration + 3 leak + full leak suite at 32/32). No deferred items beyond the pre-existing `bun test` coverage-threshold exit-1 artifact also observed in 03-02.

---

_Phase: 03-navigation-home-bdp-frame_
_Completed: 2026-05-12_
