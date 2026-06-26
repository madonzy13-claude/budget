---
phase: 10-user-settings-redesign
plan: 01
subsystem: identity
tags: [better-auth, drizzle, rls, migration, settings, provider-removal]

requires:
  - phase: 01-identity
    provides: identity users table + Better Auth additionalFields + UserRepo port
provides:
  - "AI/voice Provider feature removed end-to-end (api route, identity contracts/port/repo/domain, Better Auth additionalFields, web session normalizer)"
  - "Migration 0045 dropping identity.users.preferred_llm_provider + preferred_stt_provider"
affects: [10-02, 10-03, 10-06]

tech-stack:
  added: []
  patterns:
    - "Hand-authored idempotent DROP COLUMN migration registered in drizzle/meta/_journal.json (idx 45), applied by apps/migrator drizzle migrate()"

key-files:
  created:
    - drizzle/0045_phase10_drop_provider_prefs.sql
  modified:
    - apps/api/src/routes/settings.ts
    - apps/api/test/routes/settings.test.ts
    - packages/identity/src/adapters/persistence/better-auth.ts
    - packages/identity/src/adapters/persistence/schema.ts
    - packages/identity/src/contracts/api.ts
    - packages/identity/src/ports/user-repo.ts
    - packages/identity/src/adapters/persistence/user-repo.ts
    - packages/identity/src/domain/user.ts
    - packages/identity/test/domain.test.ts
    - apps/web/src/lib/server-session.ts
    - drizzle/meta/_journal.json

key-decisions:
  - "Code removed first, column DROP last — no window where live code reads a dropped column"
  - "Deviation (Rule 2): also removed provider members from domain/user.ts + domain.test.ts (not in plan files_modified) — they referenced the deleted LLMProviderName/STTProviderName types and would dangle"
  - "Migration registered in drizzle journal (idx 45) — migrator uses drizzle migrate(), raw .sql is a no-op unless journalled"

patterns-established:
  - "Journal registration is mandatory for hand-authored migrations to apply"

requirements-completed: [USET-08]

duration: 38min
completed: 2026-06-26
---

# Phase 10 Plan 01: Provider Feature Removal + Migration 0045 Summary

**AI/voice LLM/STT provider-preference feature stripped end-to-end across api + identity + web-session, with the two DB columns dropped via journalled migration 0045 — tenant-leak gate still 54/0.**

## Performance

- **Duration:** ~38 min
- **Started:** 2026-06-26T14:14:00Z
- **Completed:** 2026-06-26T14:25:00Z
- **Tasks:** 2 (code refactor, migration)
- **Files modified:** 11 (10 edited, 1 created)

## Accomplishments

- Removed `providerPrefsSchema` + `PUT /settings/provider-prefs` handler + its test from the api
- Removed `LLMProviderName`/`STTProviderName` types, `updateProviderPrefs` port+impl, `update-provider-prefs.ts` app service + test, and the domain `User` provider fields/`setProviderPrefs`
- Removed `preferredLlmProvider`/`preferredSttProvider` from Better Auth `additionalFields` and the Drizzle `users` schema (+ doc comment)
- Removed the web `server-session` camelCase normalizer + interface fields
- Authored + journalled migration 0045 (DROP COLUMN IF EXISTS ×2); applied on dev DB — both columns gone

## Task Commits

1. **Provider removal (api + identity + web session)** - `a0be3dd` (refactor)
2. **Drop provider-pref columns (migration 0045)** - `50ce3b6` (feat)

## Files Created/Modified

- `drizzle/0045_phase10_drop_provider_prefs.sql` - DROP both provider columns (idempotent)
- `drizzle/meta/_journal.json` - registered idx 45 so the migrator applies 0045
- `apps/api/src/routes/settings.ts` - removed provider-prefs schema/handler/import
- `apps/api/test/routes/settings.test.ts` - removed provider-prefs describe block + repo stub
- `packages/identity/src/contracts/api.ts` - removed LLM/STT types + UserDTO fields
- `packages/identity/src/ports/user-repo.ts` - removed updateProviderPrefs signature + imports
- `packages/identity/src/adapters/persistence/user-repo.ts` - removed updateProviderPrefs impl + DTO mappings
- `packages/identity/src/adapters/persistence/better-auth.ts` - removed provider additionalFields
- `packages/identity/src/adapters/persistence/schema.ts` - removed column defs + doc comment
- `packages/identity/src/domain/user.ts` - removed preferredLlm/preferredStt + setProviderPrefs (deviation)
- `packages/identity/test/domain.test.ts` - updated User ctor calls, removed setProviderPrefs tests (deviation)
- `apps/web/src/lib/server-session.ts` - removed provider normalizer + interface fields

## Decisions Made

- **Code-first, migration-last** so no deployed code reads a dropped column during rollout.
- **Journal registration required:** the migrator runs drizzle `migrate()` against `drizzle/`, which only applies migrations listed in `meta/_journal.json`. The first migrate run (file present, journal not updated) was a silent no-op; adding idx 45 + rebuilding the migrator image applied it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed provider members from domain/user.ts + domain.test.ts**

- **Found during:** Task 1 (provider removal)
- **Issue:** `packages/identity/src/domain/user.ts` carried `preferredLlm`/`preferredStt` ctor params + `setProviderPrefs`, importing the now-deleted `LLMProviderName`/`STTProviderName` types; `test/domain.test.ts` exercised them. Not in the plan's `files_modified`, but deleting the types leaves these as dangling/uncompilable references and the acceptance grep (`LLMProviderName|STTProviderName`) would still match.
- **Fix:** Dropped the two ctor params + `setProviderPrefs` from the entity; updated the 6 `new User(...)` calls and removed the 2 `setProviderPrefs` tests in domain.test.ts.
- **Files modified:** packages/identity/src/domain/user.ts, packages/identity/test/domain.test.ts
- **Verification:** `bun test test/domain.test.ts` → 6 pass / 0 fail; identity `tsc --noEmit` clean; provider grep exits clean.
- **Committed in:** a0be3dd (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for compilation + to satisfy the plan's own grep-clean acceptance criterion. No scope creep — same feature, same wave.

## Verification Results

- `grep -rn "preferredLlmProvider|preferredSttProvider|updateProviderPrefs|LLMProviderName|STTProviderName|provider-prefs|setProviderPrefs|preferredLlm|preferredStt" packages apps` → **GREP CLEAN** (exit 1)
- `\d identity.users` → neither `preferred_llm_provider` nor `preferred_stt_provider` present (verified via information_schema after migrate)
- `apps/api` settings route test → **8 pass / 0 fail** (provider tests removed, not skipped)
- `packages/identity` domain.test.ts → **6 pass / 0 fail**; `apps/api` `tsc --noEmit` → clean
- Tenant-leak gate (`bun test tests/tenant-leak`) → **54 pass / 0 fail** across 15 files (bun exit 1 is the known post-test coverage-threshold artifact, not a test failure — see memory)
- `PUT /settings/provider-prefs` → 404 by construction (route no longer mounted on the Hono app)

## Issues Encountered

- **`make ci-gate` blocked by a pre-existing local `.env` bug** (unrelated to this plan): `scripts/ci/run-tenant-leak.sh` `source`s `.env` under `set -o allexport`; line 30 `PRICE_SCAN_CRON=0 * * * *` is unquoted, so the bare `*` glob-expands to repo files and the first match runs as a command → exit 127 before any test runs. Worked around by running the gate's actual assertion (`bun test tests/tenant-leak`) directly under `infisical run` (injects DATABASE*URL*_), against the already-booted+migrated dev DB. Result was a clean 54/0. The `.env` line should be quoted (`PRICE_SCAN_CRON="0 _ \* \* \*"`) but `.env` is a local gitignored secrets file and out of this plan's scope.

## Migrator no-op gotcha

First `make migrate` after authoring the file was a no-op because 0045 was not in the journal. Fixed by registering idx 45 in `drizzle/meta/_journal.json` and rebuilding the migrator image (which bakes `drizzle/`).

## Next Phase Readiness

- Provider feature fully gone; identity schema is on the post-drop shape. 10-02 can replace the legacy settings page (its Providers tab is now dead code with no backend behind it).

---

_Phase: 10-user-settings-redesign_
_Completed: 2026-06-26_
