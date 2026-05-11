---
phase: 01-foundations
plan: "03"
plan_id: "01.03"
subsystem: platform
tags: [audit, outbox, event-bus, pg-boss, worker, rls, tdd]
dependency_graph:
  requires: ["01.00", "01.02"]
  provides:
    - shared_kernel.audit_history table (Drizzle schema + pgPolicy)
    - writeAudit(tx, evt) helper
    - shared_kernel.outbox table (Drizzle schema, NO RLS)
    - writeOutbox(tx, evt) helper
    - dispatchOutboxBatch() (PC-04 withInfraTx + PC-08 tenantContextSql)
    - eventBus (in-process pub/sub with PC-08 JSDoc)
    - getBoss() / stopBoss() pg-boss singleton
    - apps/worker entrypoint with outbox-dispatch handler
  affects:
    - apps/migrator/post-migration.sql (FORCE RLS audit_history, GRANTs outbox)
    - packages/platform/src/index.ts (new exports)
    - package.json (grep gate fixed)
tech_stack:
  added:
    - pg-boss@^12.18.2 (job queue singleton)
  patterns:
    - Transactional outbox (write in domain tx, dispatch via withInfraTx SKIP LOCKED)
    - PC-04: withInfraTx carve-out for infrastructure operations
    - PC-08: tenantContextSql applied per-row before eventBus.publish
    - TDD RED/GREEN for all three feature sets
key_files:
  created:
    - packages/platform/src/audit/schema.ts
    - packages/platform/src/audit/writer.ts
    - packages/platform/src/outbox/schema.ts
    - packages/platform/src/outbox/writer.ts
    - packages/platform/src/outbox/dispatcher.ts
    - packages/platform/src/events/bus.ts
    - packages/platform/src/jobs/boss.ts
    - packages/platform/test/audit.test.ts
    - packages/platform/test/outbox-writer.test.ts
    - packages/platform/test/outbox-restart.test.ts
    - apps/worker/src/worker.ts
    - apps/worker/src/handlers/outbox-dispatch.ts
    - apps/worker/Dockerfile
    - apps/worker/tsconfig.json
  modified:
    - packages/platform/src/index.ts (new audit/outbox/events/jobs exports)
    - packages/platform/package.json (pg-boss dependency)
    - apps/worker/package.json (start script + dependencies)
    - apps/migrator/post-migration.sql (audit_history FORCE RLS + outbox GRANTs)
    - package.json (grep:no-direct-tx gate: exclude false-positive .d.ts files)
    - bun.lock (updated)
decisions:
  - "pgEnum used for audit_action (not sharedKernel.enum which is not a Drizzle API)"
  - "{ PgBoss } named import (pg-boss v12 has no default export)"
  - "All worktree commits properly on worktree-agent-* branch (main repo accidentally received earlier commits during initial orientation; worktree commits are the canonical record)"
metrics:
  duration_minutes: 10
  completed_date: "2026-05-06"
  tasks_completed: 4
  files_changed: 15
---

# Phase 1 Plan 03: Audit History + Transactional Outbox Summary

Shipped audit-history table + writeAudit helper, transactional outbox + dispatcher (PC-04 withInfraTx + PC-08 per-row tenant context), in-process event bus, pg-boss singleton, and apps/worker bootstrap with pg-boss outbox polling.

## Tasks Completed

| Task      | Name                              | Commit      | Files                                                                   |
| --------- | --------------------------------- | ----------- | ----------------------------------------------------------------------- |
| 1 (RED)   | audit.test.ts                     | ccaeecc     | test/audit.test.ts                                                      |
| 1 (GREEN) | audit_history schema + writeAudit | de87bce     | audit/schema.ts, audit/writer.ts, index.ts, post-migration.sql          |
| 2 (RED)   | outbox-writer.test.ts             | 775ae44     | test/outbox-writer.test.ts                                              |
| 2 (GREEN) | outbox + dispatcher + event bus   | f19576a     | outbox/schema.ts, outbox/writer.ts, outbox/dispatcher.ts, events/bus.ts |
| 3 (RED)   | outbox-restart.test.ts            | e030958     | test/outbox-restart.test.ts                                             |
| 3 (GREEN) | pg-boss + worker + grep fix       | aca4b8b     | jobs/boss.ts, apps/worker/\*, package.json, bun.lock                    |
| 4         | PC-29 doc-only forward reference  | (no commit) | —                                                                       |

## Key Decisions

1. **pgEnum for audit_action**: `sharedKernel.enum()` is not a Drizzle pg-core API. Used `pgEnum('audit_action', [...])` which creates the type in the public schema. TypeScript compiles cleanly.

2. **Named import for PgBoss**: pg-boss v12 exports `{ PgBoss }` as named export (no default). Plan action showed `import PgBoss from 'pg-boss'` but TypeScript error led to the fix.

3. **grep gate false positive fix**: Adding pg-boss caused `grep:no-direct-tx` to match `.transaction(` in pg-boss's type declaration files. Fixed by adding `--exclude-dir=node_modules` to both grep commands in root package.json.

4. **Worktree orientation**: Initial commits accidentally went to main repo (`/home/claude/budget` on `master`). Corrected by recreating all commits on the proper `worktree-agent-a7560a158b2058c96` branch. The worktree commits are the canonical record for the orchestrator merge.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed writeAudit/writeOutbox tx type incompatibility**

- **Found during:** Task 1 implementation
- **Issue:** Plan specified `tx: { execute: (q: unknown) => Promise<unknown> }` but Drizzle's `PgTransaction.execute` takes `string | SQLWrapper`, causing TS2345
- **Fix:** Changed parameter type to `tx: { execute: (q: string | SQLWrapper) => Promise<unknown> }`
- **Files modified:** `packages/platform/src/audit/writer.ts`, `packages/platform/src/outbox/writer.ts`
- **Commit:** de87bce, f19576a

**2. [Rule 1 - Bug] Fixed PgBoss import (no default export in v12)**

- **Found during:** Task 3 TypeScript compilation
- **Issue:** `import PgBoss from 'pg-boss'` fails in pg-boss v12 (named exports only)
- **Fix:** Changed to `import { PgBoss } from 'pg-boss'`
- **Files modified:** `packages/platform/src/jobs/boss.ts`
- **Commit:** aca4b8b

**3. [Rule 2 - Missing critical functionality] Fixed grep gate false positive**

- **Found during:** Task 3 pre-commit hook
- **Issue:** `grep:no-direct-tx` matched pg-boss type declaration's JSDoc example `.transaction(` — breaks CI gate
- **Fix:** Added `--exclude-dir=node_modules` to both grep scripts in root `package.json`
- **Files modified:** `package.json`
- **Commit:** aca4b8b

## Known Stubs

None — all modules are fully implemented infrastructure (no UI, no placeholder data paths).

## Threat Flags

No new threat surface beyond the plan's threat model. All STRIDE threats T-01-03-01 through T-01-03-07 are mitigated as planned.

## PC-29 Compliance

drizzle-kit generate was NOT run. Plan 03 declares:

- `shared_kernel.audit_history` Drizzle schema (packages/platform/src/audit/schema.ts)
- `shared_kernel.outbox` Drizzle schema (packages/platform/src/outbox/schema.ts)

Migration SQL generation is owned by Plan 06's close-out task (last Wave-2 plan), when identity + tenancy schemas will also exist.

## Self-Check: PASSED

Files created:

- packages/platform/src/audit/schema.ts: FOUND
- packages/platform/src/audit/writer.ts: FOUND
- packages/platform/src/outbox/schema.ts: FOUND
- packages/platform/src/outbox/writer.ts: FOUND
- packages/platform/src/outbox/dispatcher.ts: FOUND
- packages/platform/src/events/bus.ts: FOUND
- packages/platform/src/jobs/boss.ts: FOUND
- apps/worker/src/worker.ts: FOUND
- apps/worker/Dockerfile: FOUND

Commits on worktree branch: ccaeecc, de87bce, 775ae44, f19576a, e030958, aca4b8b — all confirmed in worktree-agent-a7560a158b2058c96 log.
