---
phase: "08"
plan: "02"
subsystem: push-notifications
tags: [push, vapid, rls, drizzle, hono, integration-tests]
dependency_graph:
  requires: [08-01]
  provides: [push-subscribe-api, push-prefs-api, push-repo]
  affects: [apps/api, packages/platform]
tech_stack:
  added: []
  patterns:
    [
      withTenantTx-adapter-boundary,
      zValidator-session-guard,
      hono-route-factory,
    ]
key_files:
  created:
    - packages/platform/src/push/push-repo.ts
    - apps/api/src/routes/push.ts
  modified:
    - packages/platform/src/push/index.ts
    - apps/api/src/app.ts
    - apps/api/test/routes/push.test.ts
decisions:
  - push-repo uses withTenantTx/withTenantTxRead for all Drizzle queries (RLS GUC required)
  - deleteSubscription signature includes tenantId (needed for withTenantTx context)
  - getSubscriptionsForBudget takes callerUserId param to satisfy withTenantTxRead
  - getPreferences returns all 3 kinds with enabled=true defaults for missing rows
metrics:
  duration: "45 minutes"
  completed: "2026-06-10"
  tasks_completed: 2
  files_modified: 5
---

# Phase 08 Plan 02: Push Repo + Routes Summary

Push subscription management and notification preferences API (PWAX-04). All write paths session-guarded (401), all DB queries via `withTenantTx` / `withTenantTxRead` for RLS enforcement.

## Task 1: task.created outbox emission (commit a10d826)

Emit `task.created` outbox event on every real task INSERT so downstream workers can dispatch push notifications. Added to `packages/budgeting/src/adapters/persistence/task-repo.ts`.

## Task 2: push-repo + /push route + integration tests (commit 5024955)

**push-repo.ts** — Drizzle adapter at `packages/platform/src/push/push-repo.ts`:

- `upsertSubscription` — INSERT … ON CONFLICT DO UPDATE on `endpoint` unique index
- `deleteSubscription(endpoint, tenantId, userId)` — scoped to userId ownership
- `getSubscriptionsForBudget(tenantId, budgetId, kind, callerUserId)` — fetches subs then filters users with explicit `enabled=false` pref for that kind
- `getPreferences(tenantId, userId, budgetId)` — returns all 3 kinds; missing rows default to `enabled=true`
- `upsertPreference` — INSERT … ON CONFLICT DO UPDATE on `(userId, budgetId, notificationType)` index

**push.ts route** — `apps/api/src/routes/push.ts`:

- `POST /push/subscribe` — zValidator(subscribeSchema); 401 guard; upserts subscription
- `DELETE /push/subscribe` — zValidator(unsubscribeSchema); 401 guard; removes subscription
- `GET /push/preferences?budgetId` — 401 guard; returns 3-kind prefs with defaults
- `PATCH /push/preferences` — zValidator(prefsSchema); 401 guard; upserts one pref toggle

**Mounted** at `app.use("/push/*", requireAuth)` + `app.route("/push", createPushRoute(deps))` in `app.ts`.

**Integration tests** — `apps/api/test/routes/push.test.ts` — 11 tests, all green:

- POST subscribe → `{ok:true}`; idempotent upsert; 401 without session
- DELETE subscribe → `{ok:true}`; 401 without session
- GET preferences → 3 kinds default `enabled=true`; 401; 400 missing budgetId
- PATCH preferences → `{ok:true}`; reflected in subsequent GET; 401 without session

## Deviations from Plan

**1. [Rule 3 - Blocking] Migration 0032 not applied by `make migrate`**

- Found during: Task 2 test run — `relation "shared_kernel.push_subscriptions" does not exist`
- Issue: Drizzle journal recorded migration as applied (id=33) but tables were absent; `make migrate` reported "complete" without actually running 0032 SQL
- Fix: Ran migration SQL directly via migrator pool — all statements applied cleanly
- Files modified: none (DB state only)
- Commit: 5024955 (tests pass after fix)

**2. [Rule 1 - Bug] deleteSubscription needed tenantId parameter**

- Found during: Task 2 implementation — `withTenantTx` requires a tenantId to set the GUC
- Fix: Added `tenantId` as second parameter to `deleteSubscription`; updated route handler to read from `c.get("tenantIds")`
- Files modified: push-repo.ts, push.ts

**3. [Rule 2 - Missing] getSubscriptionsForBudget needed callerUserId**

- Found during: Task 2 implementation — `withTenantTxRead` requires a userId
- Fix: Added `callerUserId` parameter; routes pass `session.user.id`
- Files modified: push-repo.ts

## Known Stubs

None — all functions query real DB; getSubscriptionsForBudget is wired and functional.

## Self-Check: PASSED

- packages/platform/src/push/push-repo.ts — exists
- apps/api/src/routes/push.ts — exists
- apps/api/test/routes/push.test.ts — 11 pass, 0 fail
- Commits a10d826 and 5024955 — confirmed in git log
