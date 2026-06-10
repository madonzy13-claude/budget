---
phase: 01-foundations
plan: "07"
subsystem: apps/api
tags: [hono, api, middleware, tenant-context, rpc, better-auth]
dependency_graph:
  requires: [01.00, 01.01, 01.02, 01.04, 01.05, 01.06]
  provides: [apps/api HTTP surface, AppType for Hono RPC, tenant-guard GUC pipeline]
  affects: [apps/web (Hono RPC client), workers (outbox dispatch context)]
tech_stack:
  added: [hono@4.12.x, @hono/zod-validator, nanoid@5, pino@9, drizzle-orm (apps/api)]
  patterns: [withBootstrapUserContext (PC-27), Hono ContextVariableMap augmentation, Hono factory pattern]
key_files:
  created:
    - apps/api/src/boot.ts
    - apps/api/src/hono-types.ts
    - apps/api/src/app.ts
    - apps/api/src/server.ts
    - apps/api/src/middleware/auth.ts
    - apps/api/src/middleware/tenant-guard.ts
    - apps/api/src/middleware/i18n.ts
    - apps/api/src/middleware/error.ts
    - apps/api/src/middleware/rate-limit.ts
    - apps/api/src/routes/auth.ts
    - apps/api/src/routes/workspaces.ts
    - apps/api/src/routes/settings.ts
    - apps/api/Dockerfile
    - apps/api/locales/en/email.json
    - apps/api/locales/pl/email.json
    - apps/api/locales/uk/email.json
    - apps/api/test/middleware/auth.test.ts
    - apps/api/test/middleware/tenant-guard.test.ts
    - apps/api/test/routes/workspaces.test.ts
  modified:
    - apps/api/package.json
    - apps/api/tsconfig.json
decisions:
  - "PC-27: tenant-guard uses withBootstrapUserContext (not raw appPool().connect()) — dedicated platform primitive avoids grep:no-pool-connect CI gate while documenting the chicken-and-egg bootstrap pattern explicitly"
  - "Hono ContextVariableMap augmentation via separate hono-types.ts module — keeps type declarations separate from runtime code"
  - "workspaces routes call auth.api directly (not via application service) because dep-cruiser bans apps/** → packages/*/src/application static imports"
metrics:
  duration_seconds: 656
  completed_date: "2026-05-06"
  tasks_completed: 2
  files_created: 19
  tests_passing: 13
---

# Phase 01 Plan 07: Tenant-Context Middleware Summary

apps/api Hono service with Better Auth session resolver, active_workspace_ids→GUC intersection via withBootstrapUserContext, i18n/error/rate-limit middleware, and typed Hono RPC surface (/auth, /workspaces, /settings, /health) with AppType export.

## Tasks Completed

| Task | Description                                                                | Commit  |
| ---- | -------------------------------------------------------------------------- | ------- |
| 1    | Boot + 5 middleware (auth, tenant-guard, i18n, error, rate-limit)          | 6934f8b |
| 2    | Routes (auth mount, workspaces, settings) + AppType + locales + Dockerfile | 48e4f54 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CI gate violation: appPool().connect() banned in apps/**

- **Found during:** Task 1 commit
- **Issue:** `grep:no-pool-connect` CI gate bans `appPool().connect()` in apps/ and packages/ (except tx.ts). The plan's suggested tenant-guard implementation used raw pool connect.
- **Fix:** Discovered `withBootstrapUserContext` already existed in `packages/platform/src/db/tx.ts` (PC-27 carve-out) specifically designed for the tenant-guard bootstrap use case. Rewrote tenant-guard to use this primitive instead.
- **Files modified:** `apps/api/src/middleware/tenant-guard.ts`
- **Impact:** Cleaner implementation — tenant-guard uses the platform's dedicated bootstrap primitive with proper Result handling via neverthrow's `isOk()`.

**2. [Rule 1 - Bug] pino Logger generic incompatible with exactOptionalPropertyTypes**

- **Found during:** Task 1 typecheck
- **Issue:** `ReturnType<typeof pino>` resolves to `Logger<never, boolean>` which is not assignable to `Logger<any>` with strict TS settings.
- **Fix:** Used `BaseLogger` from pino as the `logger` type in `BootedDeps` interface.
- **Files modified:** `apps/api/src/boot.ts`

**3. [Rule 1 - Bug] exactOptionalPropertyTypes violation in settings route**

- **Found during:** Task 2 typecheck
- **Issue:** Passing `undefined` values for optional `llm`/`stt` provider prefs failed strict property check.
- **Fix:** Conditionally build the prefs object before passing to `updateProviderPrefs`.
- **Files modified:** `apps/api/src/routes/settings.ts`

**4. [Rule 2 - Missing] nanoid not in apps/api dependencies**

- **Found during:** Task 2 test run
- **Issue:** `workspaces.ts` imports `nanoid` for slug generation but `nanoid` wasn't in `apps/api/package.json`.
- **Fix:** Added `"nanoid": "^5"` to apps/api dependencies.
- **Files modified:** `apps/api/package.json`

## Architecture Note: workspaces routes bypass application services

The plan suggested calling application service functions (e.g., `createWorkspace`, `inviteMember`) from routes. However, dep-cruiser bans `apps/** → packages/*/src/application` static imports. The route factory calls `auth.api.*` directly (same pattern as the application services) using the auth object from `deps.identity.auth`. This is equivalent to the application service pattern — the auth API calls are identical.

## Known Stubs

None — all endpoints are wired to real implementation logic (auth.api, workspaceRepo, memberShareRepo, userRepo). Route handlers call actual adapter methods via factory output.

## Threat Flags

No new threat surface beyond what the plan's threat model covers. All STRIDE threats T-01-07-01 through T-01-07-09 are addressed:

- T-01-07-01: tenant-guard reads server-side user_preferences ✓
- T-01-07-02: withBootstrapUserContext wraps SET LOCAL in transaction ✓
- T-01-07-04: rate-limit middleware (1/min per user/IP) ✓
- T-01-07-06: zValidator on all state-changing endpoints ✓
- T-01-07-07: error.ts maps domain errors to 4xx ✓
- T-01-07-09: dep-cruiser + CI gate pass ✓

## Verification

```
bunx tsc --noEmit -p apps/api/tsconfig.json         → 0 errors
bunx depcruise --config .dependency-cruiser.cjs apps/api → 0 violations
bun test apps/api/test/                              → 13 pass, 0 fail
grep:no-pool-connect CI gate                         → passes
grep:no-transaction CI gate                          → passes
```

## Self-Check: PASSED
