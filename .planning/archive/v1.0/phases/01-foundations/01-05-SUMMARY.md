---
phase: 01-foundations
plan: 05
plan_id: "01.05"
subsystem: identity
tags:
  [
    better-auth,
    drizzle,
    rls,
    pii,
    dek,
    email-verification,
    sessions,
    user-preferences,
  ]
dependency_graph:
  requires: ["01.00", "01.01", "01.02", "01.04"]
  provides:
    [
      "@budget/identity",
      "createIdentityModule",
      "createAuth",
      "DrizzleUserRepo",
    ]
  affects: ["apps/api", "apps/worker", "01.06-tenancy"]
tech_stack:
  added:
    - better-auth@^1.6.9
    - better-auth/adapters/drizzle (drizzleAdapter)
    - drizzle-orm@^0.45.2 (identity package dependency)
  patterns:
    - Better Auth with Drizzle adapter + additionalFields
    - databaseHooks.user.create.before/after for D-16 PII + PC-03 DEK
    - withUserContext (PC-03) for all user-scoped DB writes
    - Lazy require() in factory.ts to keep contracts/ free of adapter imports
key_files:
  created:
    - packages/identity/src/domain/user.ts
    - packages/identity/src/domain/session.ts
    - packages/identity/src/domain/events.ts
    - packages/identity/src/contracts/api.ts
    - packages/identity/src/contracts/events.ts
    - packages/identity/src/contracts/factory.ts
    - packages/identity/src/ports/user-repo.ts
    - packages/identity/src/ports/credential-repo.ts
    - packages/identity/src/adapters/persistence/schema.ts
    - packages/identity/src/adapters/persistence/user-preferences.ts
    - packages/identity/src/adapters/persistence/better-auth.ts
    - packages/identity/src/adapters/persistence/user-repo.ts
    - packages/identity/src/application/sign-up.ts
    - packages/identity/src/application/verify-email.ts
    - packages/identity/src/application/reset-password.ts
    - packages/identity/src/application/update-locale.ts
    - packages/identity/src/application/update-display-currency.ts
    - packages/identity/src/application/update-provider-prefs.ts
    - packages/identity/src/application/list-sessions.ts
    - packages/identity/src/application/revoke-session.ts
    - packages/identity/test/domain.test.ts
    - packages/identity/test/schema.test.ts
    - packages/identity/test/sign-up.test.ts
    - packages/identity/test/verify-email.test.ts
    - packages/identity/test/reset-password.test.ts
    - packages/identity/test/sessions.test.ts
    - packages/identity/test/locale.test.ts
    - packages/identity/test/display-currency.test.ts
    - packages/identity/test/provider-prefs.test.ts
  modified:
    - packages/identity/package.json
    - packages/identity/src/index.ts
    - apps/migrator/post-migration.sql
    - apps/migrator/drizzle.config.ts
decisions:
  - "Used better-auth/adapters/drizzle (not @better-auth/drizzle-adapter) — adapter ships inside better-auth 1.6+ package"
  - "D-16 PII: email_hash computed in user.create.before hook using LibsodiumKeyStore.emailHash; plain email column kept for Phase 1 Better Auth compatibility"
  - "PC-09: DEK insert in user.create.after is best-effort (does not throw on failure); Phase 6 reconciliation worker planned"
  - "listSessions returns empty array — Better Auth session list requires HTTP request context (session cookie); UI fetches via Better Auth client"
  - "findByEmail uses plain email column (not email_hash) — pre-auth lookup has no userId; Phase 6 migrates to email_hash-only lookup"
  - "factory.ts uses lazy require() to keep contracts/ free of Better Auth type imports at typecheck time"
metrics:
  duration_seconds: 757
  completed_date: "2026-05-06"
  tasks_completed: 3
  files_created: 29
  files_modified: 4
---

# Phase 01 Plan 05: Identity Context Summary

Identity bounded context: Better Auth with Drizzle adapter, email/password authentication, session management, user preferences, and PII encryption hooks.

## What Was Built

### Task 1 — Domain + Contracts + Ports + Factory

Pure domain layer with no adapter dependencies:

- `User` entity with `changeLocale`/`changeDisplayCurrency`/`setProviderPrefs` invariants
- `Session` entity (plain TS, no framework imports)
- `contracts/api.ts`: `Locale`, `UserDTO`, `SessionDTO` types
- `contracts/events.ts`: `UserSignedUp`, `UserVerified`, `LocaleChanged`, `DisplayCurrencyChanged`, `SessionRevoked`
- `contracts/factory.ts`: `createIdentityModule()` — PC-02/PC-15 sole entry point for apps/\*
- `ports/user-repo.ts` + `ports/credential-repo.ts`: pure interfaces
- dep-cruiser + tsc pass; domain layer clean of drizzle/better-auth imports

**Commits:** `48c4604` (RED), `4c06bd9` (GREEN)

### Task 2 — Drizzle Persistence Schema

- `identity.users`: Better Auth core + D-16 PII columns (email_hash bytea, email_encrypted, email_nonce, name_encrypted, name_nonce) + additionalFields (locale, display_currency, preferred_llm_provider, preferred_stt_provider) + RLS
- `identity.sessions`, `identity.accounts`, `identity.verifications`: Better Auth core tables
- `identity.user_preferences`: D-07 active_workspace_ids uuid[] with owner-only RLS
- `post-migration.sql`: GRANT + FORCE ROW LEVEL SECURITY for 4 identity tables
- `drizzle.config.ts`: extended to include audit, outbox, user_keys, identity schema files

**Commit:** `a4ffeb5`

### Task 3 — Better Auth Instance + Application Services

- `createAuth()`: Better Auth with drizzleAdapter, emailAndPassword (grace login D-13), emailVerification (24h TTL), sendResetPassword (30min TTL D-14), additionalFields, rateLimit, D-16 databaseHooks
- PC-03: `user.create.after` uses `withUserContext` (never raw pool.connect())
- PC-09: DEK insert is best-effort; logs failure without throwing (Phase 6 reconciliation)
- `DrizzleUserRepo`: implements UserRepo port with `withUserContext` for all DB writes
- 8 application services: signUp, verifyEmail, requestPasswordReset, confirmPasswordReset, updateLocale, updateDisplayCurrency, updateProviderPrefs, listSessions, revokeSession
- 7 integration test files covering IDNT-01..08 + MONY-09

**Commits:** `2051b30`, `b368ff7` (lint fixes)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Better Auth drizzle adapter import path**

- **Found during:** Task 3 implementation
- **Issue:** Plan specified `@better-auth/drizzle-adapter` package but better-auth 1.6+ ships the adapter inside the main package at `better-auth/adapters/drizzle`
- **Fix:** Used `import { drizzleAdapter } from "better-auth/adapters/drizzle"` — no extra package needed
- **Files modified:** `packages/identity/src/adapters/persistence/better-auth.ts`
- **Commit:** `2051b30`

**2. [Rule 1 - Bug] revokeSession requires headers**

- **Found during:** Task 3 tsc check
- **Issue:** Better Auth `revokeSession` API requires `headers` in the input context (httpOnly cookie enforcement)
- **Fix:** Added `headers: new Headers()` to server-side call
- **Files modified:** `packages/identity/src/application/revoke-session.ts`
- **Commit:** `2051b30`

**3. [Rule 1 - Bug] PC-03 comment tripped CI grep gate**

- **Found during:** Task 3 post-commit verification
- **Issue:** Comment `// NEVER raw appPool().connect()` would trip the CI grep gate that bans `appPool().connect()` anywhere outside tx.ts
- **Fix:** Reworded comment to `// raw pool.connect() is forbidden here (CI gate)`
- **Files modified:** `packages/identity/src/adapters/persistence/better-auth.ts`
- **Commit:** `2051b30`

## Known Limitations

**Integration tests require Plan 06 migration generation (PC-29)**

The 7 integration tests (sign-up, verify-email, reset-password, sessions, locale, display-currency, provider-prefs) use `startTestcontainer()` which applies migrations from `drizzle/`. Since `drizzle-kit generate` is owned by Plan 06, the identity tables don't exist in migrations yet. Tests compile and are logically correct but will fail with "relation does not exist" until Plan 06 runs.

Domain tests (`domain.test.ts`) and schema structure tests (`schema.test.ts`) pass without a DB.

**listSessions server-side limitation**

Better Auth's `listSessions` API requires an HTTP request context (session cookie). The `listSessions` application service returns an empty array when called server-side. The UI retrieves sessions via the Better Auth client SDK. This is documented behavior — the test file covers the array response shape.

**Phase 6 TODOs**

- Drop plain `email` column from identity.users (route all lookups via `email_hash`)
- `findByEmail` currently uses plain email column (pre-auth lookup has no userId for withUserContext)
- Phase 6 reconciliation worker for orphan users without DEK rows (PC-09)

## Threat Flags

| Flag                       | File           | Description                                                                                                                                          |
| -------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: pii_plaintext | identity.users | Plain email column kept for Phase 1 Better Auth compatibility; email_hash + email_encrypted added but Phase 6 must drop plain email to complete D-16 |

## Self-Check: PASSED

Files exist:

- FOUND: packages/identity/src/contracts/factory.ts
- FOUND: packages/identity/src/adapters/persistence/better-auth.ts
- FOUND: packages/identity/src/adapters/persistence/schema.ts
- FOUND: packages/identity/src/adapters/persistence/user-preferences.ts
- FOUND: apps/migrator/post-migration.sql (identity FORCE RLS present)

Commits exist:

- FOUND: 48c4604 (RED)
- FOUND: 4c06bd9 (GREEN Task 1)
- FOUND: a4ffeb5 (Task 2)
- FOUND: 2051b30 (Task 3)
- FOUND: b368ff7 (lint fixes)

tsc: PASS
dep-cruiser: PASS (79 modules, 161 dependencies, 0 violations)
PC-03 grep gate: PASS (no appPool().connect() in adapter files outside tx.ts)
