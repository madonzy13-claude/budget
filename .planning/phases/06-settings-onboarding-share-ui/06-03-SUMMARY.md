---
phase: 06-settings-onboarding-share-ui
plan: "03"
subsystem: tenancy/api, api/routes
tags:
  [
    budget-members,
    revoke-member,
    member-list,
    sett-05,
    sett-06,
    sett-07,
    last-owner-guard,
    owner-gate,
  ]
dependency_graph:
  requires:
    - plan/06-01 (Wave 0 RED tests scaffold — budget-members.test.ts)
    - plan/06-02 (PATCH /budgets/:id, app.ts mount patterns)
  provides:
    - GET /budgets/:id/members (SETT-05)
    - POST /budgets/:id/members/:memberId/revoke (SETT-07, owner-only, last-owner guard)
    - Regression guard for POST /budgets/:id/leave last-owner → 409 (D-12)
    - Route-ordering regression guard for /:id/members not swallowed by /:id
  affects:
    - plans/06-05 (settings accordion UI can call GET members + POST revoke)
    - plans/06-08 (E2E budget-settings.feature can exercise member management)
tech_stack:
  added: []
  patterns:
    - "budgetMembersRoutesFactory: separate route file mounted before budgetsRoutesFactory in app.ts for path specificity"
    - "listMembers-based owner gate: uses injected workspaceRepo.listMembers instead of withBootstrapUserContext — testable without real DB"
    - "last-owner guard: counts owners from listMembers result, 409 if sole owner would be removed"
    - "tenant gate: tenantIds.includes(budgetId) → 404 (T-06-03-03)"
key_files:
  created:
    - apps/api/src/routes/budget-members.ts
  modified:
    - apps/api/src/app.ts (import + mount budgetMembersRoutesFactory before budgetsRoutesFactory)
    - apps/api/test/routes/budget-members.test.ts (expanded from 4 RED tests to 9 GREEN tests)
decisions:
  - "Owner gate uses listMembers (injected dep) not withBootstrapUserContext — avoids real DB dependency in unit tests; listMembers already sets RLS context via withInfraTx in the workspace-repo adapter"
  - "budgetMembersRoutesFactory mounted BEFORE budgetsRoutesFactory in app.ts — Hono path specificity: /:id/members registered first wins over /:id param capture in budgetsRoutesFactory"
  - "Test mock redesigned: Wave 0 scaffold had tenancy:{} empty — needed proper listMembers mock returning owner/member entries so owner-gate and last-owner-guard tests work without real DB"
metrics:
  duration: "~10 min"
  completed: "2026-05-22"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 6 Plan 03: Budget Members Backend Summary

**One-liner:** GET /budgets/:id/members and POST revoke-member (owner-only, last-owner guard) using listMembers-based owner gate; 9 tests GREEN including D-12 leave regression and route-ordering assertion.

## Tasks Completed

| #   | Task                                                                                          | Commit  | Key Files                                          |
| --- | --------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------- |
| 1   | Create budget-members.ts route — GET members + POST revoke; mount in app.ts                   | 2e59965 | budget-members.ts, app.ts, budget-members.test.ts  |
| 2   | Regression tests — share-link + last-owner leave + route-ordering (merged into task 1 commit) | 2e59965 | budget-members.test.ts (regression describe block) |

## Verification Results

- `bun test test/routes/budget-members.test.ts` — 9 pass, 0 fail
- `bun test test/routes/budgets.test.ts` — 7 pass, 0 fail (no regression)
- `grep -c "budgetMembersRoutesFactory" apps/api/src/routes/budget-members.ts` → 2
- `grep "listMembers" apps/api/src/routes/budget-members.ts` → match
- `grep 'role !== "owner"' apps/api/src/routes/budget-members.ts` → match
- `grep -c "last_owner" apps/api/src/routes/budget-members.ts` → 1
- `grep "budgetMembersRoutesFactory" apps/api/src/app.ts` → match (import + mount)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wave 0 test scaffold used empty mock `{ tenancy: {}, identity: {} }` — owner gate untestable**

- **Found during:** Task 1 (GREEN phase — 403 test got 500 instead)
- **Issue:** The Wave 0 RED scaffold passed `budgetMembersRoutesFactory({ tenancy: {}, identity: {} })` which meant `deps.tenancy.workspaceRepo` was `undefined`. The owner gate (and all listMembers calls) would throw, causing 500 instead of 403/200.
- **Fix:** Expanded test mock to provide a proper `workspaceRepo.listMembers` returning `[{ userId: "user-owner", role: "owner" }, { userId: "user-member", role: "member" }]`; added `identity.auth.api.removeMember` stub.
- **Files modified:** apps/api/test/routes/budget-members.test.ts
- **Commit:** 2e59965

### Design Adjustments

**1. listMembers-based owner gate instead of withBootstrapUserContext**

- **Reason:** Plan specified copying the `withBootstrapUserContext` pattern from budgets.ts (raw SQL lookup). Using `listMembers` (injected dep) instead achieves the same security guarantee (T-06-03-01) while keeping the handler testable without a real DB connection — consistent with `budget-identity.ts` approach.
- **Impact:** No functional difference in production (workspaceRepo.listMembers calls withInfraTx internally); better test isolation.

## Threat Model Compliance

| Threat ID  | Mitigation Status | Location                                                          |
| ---------- | ----------------- | ----------------------------------------------------------------- |
| T-06-03-01 | Mitigated         | listMembers role lookup → 403 for non-owner callers               |
| T-06-03-02 | Mitigated         | Owner count from listMembers → 409 last_owner if sole owner       |
| T-06-03-03 | Mitigated         | tenantIds.includes(budgetId) → 404 before listMembers call        |
| T-06-03-04 | Accepted          | listMembers returns userId/role/joinedAt only (no raw PII beyond) |

## Known Stubs

None — all plan deliverables fully implemented.

## Threat Flags

None — no new network endpoints or auth paths beyond those planned.

## Self-Check

- [x] budget-members.ts exists — FOUND
- [x] budgetMembersRoutesFactory exported — FOUND
- [x] createBudgetMembersRoute alias exported — FOUND
- [x] listMembers used for GET members — FOUND
- [x] role !== "owner" gate — FOUND
- [x] last_owner guard with 409 — FOUND
- [x] tenant gate (tenantIds.includes) — FOUND
- [x] app.ts imports budgetMembersRoutesFactory — FOUND
- [x] app.ts mounts before budgetsRoutesFactory — FOUND
- [x] budget-members.test.ts GREEN 9/9 — VERIFIED
- [x] budgets.test.ts GREEN 7/7 — VERIFIED
- [x] Commit 2e59965 exists — FOUND

## Self-Check: PASSED
