---
phase: 06-settings-onboarding-share-ui
plan: "04"
subsystem: tenancy/api
tags: [archive, delete, danger-zone, onboarding-progress, sett-08, onbd-07]
dependency_graph:
  requires: ["06-01", "06-02", "06-03"]
  provides: ["SETT-08", "ONBD-07"]
  affects: ["workspace-repo.ts", "budget-repo.ts", "app.ts"]
tech_stack:
  added: []
  patterns:
    [
      "owner-gate via listMembers injection",
      "soft-delete archived_at IS NULL filter",
      "typed-name hard-delete server validation",
    ]
key_files:
  created:
    - apps/api/src/routes/budget-archive.ts
  modified:
    - apps/api/src/app.ts
    - apps/api/src/routes/onboarding.ts
    - packages/tenancy/src/ports/budget-repo.ts
    - packages/tenancy/src/adapters/persistence/workspace-repo.ts
    - apps/api/test/routes/budget-archive.test.ts
    - apps/api/test/routes/budget-route-ordering.test.ts
decisions:
  - "D-10: archive is one-way — no unarchive/restore method or route in v1.1; DB row retained but no repo method exposes a path back"
  - "Owner gate uses listMembers injection (not withBootstrapUserContext) for testability — consistent with budget-members.ts pattern"
  - "Route file named budget-archive.ts (not budget-danger-zone.ts) to match Wave 0 scaffold test import"
  - "archived_at IS NULL filter in listForUser (workspace-repo.ts) only — not duplicated in budgets.ts (06-02 owns that file)"
metrics:
  duration: "~25 min"
  completed: "2026-05-22"
  tasks: 2
  files: 7
---

# Phase 6 Plan 04: Danger-Zone Routes + Onboarding Progress Summary

Onboarding-progress GET/PUT (session-scoped, user_id from session only) and budget danger-zone archive/delete (owner-gated soft/hard delete, server-validated typed name) in dedicated route files.

## Tasks Completed

| Task | Name                                                                                       | Commit  | Files                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Onboarding-progress repo + GET/PUT /onboarding/progress route                              | 5e87f22 | apps/api/src/routes/onboarding.ts, packages/tenancy/src/adapters/persistence/onboarding-progress-repo.ts                                                           |
| 2    | budget-archive.ts route — POST /:id/archive + POST /:id/delete; archived_at IS NULL filter | 75db4c1 | apps/api/src/routes/budget-archive.ts, packages/tenancy/src/adapters/persistence/workspace-repo.ts, packages/tenancy/src/ports/budget-repo.ts, apps/api/src/app.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Route file named budget-archive.ts instead of budget-danger-zone.ts**

- **Found during:** Task 2 setup
- **Issue:** Wave 0 scaffold test imports from `../../src/routes/budget-archive`, but plan frontmatter listed `budget-danger-zone.ts`
- **Fix:** Created `budget-archive.ts`; exported `createBudgetDangerZoneRoute` as a named alias for plan cross-references
- **Files modified:** apps/api/src/routes/budget-archive.ts

**2. [Rule 1 - Bug] budget-archive.test.ts scaffold passed `tenancy: {}` (no mock)**

- **Found during:** Task 2 TDD RED phase
- **Issue:** Original scaffold passed `{ tenancy: {}, identity: {} }` which would throw on `workspaceRepo.listMembers` call — route would 500, not 200/403
- **Fix:** Updated test to provide proper `workspaceRepo` mock (listMembers, archive, hardDelete, findById) consistent with budget-members.test.ts pattern
- **Files modified:** apps/api/test/routes/budget-archive.test.ts

**3. [Rule 1 - Bug] budget-route-ordering.test.ts mounted budgetsRoutesFactory FIRST**

- **Found during:** Task 2 post-implementation regression check
- **Issue:** Test registered the catch-all `/:id` handler before sub-path factories, causing sub-paths to be swallowed — opposite of the invariant it was testing
- **Fix:** Reordered to match app.ts: members → archive → budgetsRoutesFactory; added proper mock deps
- **Files modified:** apps/api/test/routes/budget-route-ordering.test.ts

## Acceptance Criteria Verification

- `grep -c "createBudgetDangerZoneRoute" apps/api/src/routes/budget-archive.ts` → 1
- `grep -c 'r.post("/:id/archive"' apps/api/src/routes/budget-archive.ts` → 1
- `grep -c 'r.post("/:id/delete"' apps/api/src/routes/budget-archive.ts` → 1
- `grep "name_mismatch" apps/api/src/routes/budget-archive.ts` → matches
- `grep "budgetArchiveRoutesFactory" apps/api/src/app.ts` → matches
- `grep "archived_at IS NULL" packages/tenancy/src/adapters/persistence/workspace-repo.ts` → matches
- `git diff --name-only apps/api/src/routes/budgets.ts` → EMPTY (untouched)
- `bun test test/routes/budget-archive.test.ts` → 5/5 GREEN
- `bun test test/routes/onboarding.test.ts` → 4/4 GREEN

## Security Threat Coverage

| Threat                                      | Mitigation                                                          | Status               |
| ------------------------------------------- | ------------------------------------------------------------------- | -------------------- |
| T-06-04-01: non-owner archive/delete        | listMembers role check → 403                                        | Implemented          |
| T-06-04-02: typed-name bypass               | Server re-validates confirmName === budget.name → 422 name_mismatch | Implemented          |
| T-06-04-03: cross-user onboarding_progress  | Endpoints key on session.user.id; body user_id ignored              | Implemented (Task 1) |
| T-06-04-04: SQL injection                   | Drizzle sql template bind params only                               | Implemented          |
| T-06-04-05: orphaned FK rows on hard-delete | ON DELETE CASCADE FKs; hardDelete runs in withTenantTx              | Implemented          |

## Self-Check: PASSED

- `apps/api/src/routes/budget-archive.ts` — FOUND
- `apps/api/src/routes/onboarding.ts` — FOUND (Task 1, commit 5e87f22)
- commit 5e87f22 — FOUND (Task 1)
- commit 75db4c1 — FOUND (Task 2)
