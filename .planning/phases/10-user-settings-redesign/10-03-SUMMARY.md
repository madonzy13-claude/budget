---
phase: 10-user-settings-redesign
plan: 03
subsystem: identity-ui
tags:
  [
    better-auth,
    change-email,
    email-hash,
    next-intl,
    email-template,
    tdd,
    settings,
  ]

requires:
  - phase: 10-user-settings-redesign
    provides: User-pill accordion Profile slot (10-02) + provider-free identity (10-01)
  - phase: 02-identity
    provides: encrypted-PII users (plain email + deterministic email_hash backing users_email_hash_uq), withUserContext RLS GUC, create-after key/onboarding seeding
provides:
  - "Profile section: edit account name (authClient.updateUser) + request email change (authClient.changeEmail → confirm link to CURRENT address)"
  - "Better Auth user.changeEmail enabled with sendChangeEmailConfirmation → change-email template"
  - "Shared recomputeEmailHash helper wired into BOTH create-after and update-after hooks (keeps email_hash in sync on email change)"
  - "change-email email template (en/pl/uk) + renderer"
  - "settings.profile.* leaf i18n keys (name/email/error) en/pl/uk"
affects: [10-04, 10-06]

tech-stack:
  added: []
  patterns:
    - "Server-seed client section props (mirrors GeneralPill): vanilla better-auth/client useSession is a nanostore Atom, NOT a hook — thread name/email/emailVerified from the catch-all page's fresh getServerSession through UserPill, never call useSession() in a component"
    - "Shared recomputeEmailHash(keyStore,userId,email): one helper, called by create-after AND update-after — changeEmail writes only the plain email column, so the hash must be recomputed or users_email_hash_uq + findByEmail go stale"
    - "TDD: real-Postgres testcontainer guards the email_hash gotcha; template render test guards the address↔template mapping; full HTTP changeEmail round-trip deferred to E2E"

key-files:
  created:
    - packages/identity/test/email-change-hash.test.ts
    - apps/web/test/settings/profile-section.test.tsx
    - apps/web/e2e/features/settings-profile.feature
    - apps/web/e2e/steps/settings-profile.steps.ts
  modified:
    - packages/identity/src/adapters/persistence/better-auth.ts
    - packages/platform/src/email/templates.ts
    - packages/platform/test/email-templates.test.ts
    - apps/web/src/components/settings/profile-section.tsx
    - apps/web/src/components/settings/user-pill.tsx
    - apps/web/src/components/settings/user-settings-shell.tsx
    - apps/web/src/app/[locale]/(app)/settings/[[...tab]]/page.tsx
    - apps/web/test/settings/user-settings-shell.test.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json

key-decisions:
  - "Server-seed props over a client session read: the vanilla better-auth/client has no useSession React hook (it is a nanostore Atom), and no @nanostores/react / better-auth/react is installed. The catch-all page already does a FRESH getServerSession, so threading props is SSR-correct, flash-free, and adds no dep."
  - "Confirmation link goes to the CURRENT (old) address (updateEmailWithoutVerification:false): the account email is verified, so Better Auth confirms ownership of the old inbox first, THEN re-verifies the new address via the existing emailVerification.sendVerificationEmail path."
  - "E2E asserts the success/confirmation notices (the UI wiring) EN-only; the email_hash recompute + re-verify hop is proven at the DB layer by email-change-hash.test.ts, and multi-locale rendering by the component test + i18n parity."

patterns-established:
  - "recomputeEmailHash shared helper is the single source for email_hash writes"
  - "Section components are server-seeded via props threaded through the pill, never via a client session hook"

requirements-completed: [USET-04]

duration: ~30min
completed: 2026-06-26
---

# Phase 10 Plan 03: Profile Section (name + email change) Summary

**The User-pill Profile slot now edits the account name and requests an email change. Better Auth `user.changeEmail` is enabled (confirm link to the current address); a shared `recomputeEmailHash` helper keeps the deterministic `email_hash` in sync on both create-after and update-after; a `change-email` email template ships in en/pl/uk. TDD throughout: real-Postgres hash guard, template render test, component test, live E2E.**

## Performance

- **Duration:** ~30 min (RED → GREEN → build-fix → E2E)
- **Completed:** 2026-06-26
- **Tasks:** RED tests, change-email template, changeEmail + email_hash hook, ProfileSection + i18n, server-seed props build fix, E2E
- **Files:** 4 created, 11 modified

## Accomplishments

- `templates.ts`: `change-email` added to the TemplateName union + STRINGS (en/pl/uk) + renderer + `newEmail` TemplateVar. Sent to the CURRENT address with the confirm URL and the new address.
- `better-auth.ts`: `user.changeEmail` enabled (`sendChangeEmailConfirmation` → change-email template, `updateEmailWithoutVerification:false`); exported `recomputeEmailHash(keyStore,userId,email)` helper; create-after now calls it (instead of inline hash) and a new `databaseHooks.user.update.after` calls it too — the changeEmail-confirm path writes only the plain email column, so without this the `users_email_hash_uq` hash would stale.
- `profile-section.tsx`: name field → `authClient.updateUser({ name })`; email field → `authClient.changeEmail({ newEmail, callbackURL })`; pending badge when `emailVerified === false`. Server-seeded via props.
- i18n: `settings.profile.{name,email,error}` leaf keys in all 3 locales (parity verified).

## Task Commits

1. **RED** — `6457a19` test(10-03): failing email-change hash + change-email template + profile-section tests
2. **GREEN** — `5cd19d4` feat(10-03): profile name+email edit, changeEmail + email_hash hook, change-email template
3. **Build fix** — `4ec86b1` fix(10-03): server-seed profile props instead of nanostore useSession
4. **E2E** — `6cc7883` test(10-03): profile e2e — change name + change email confirmation

## Decisions Made

- **Server-seed props, not a client session hook.** The vanilla `better-auth/client` `useSession` is a nanostore `Atom`, not a callable React hook — calling it passed Vitest (mocked as a function) but failed `next build` type-check (`This expression is not callable`). No `@nanostores/react` / `better-auth/react` is installed. Fixed by mirroring GeneralPill: the catch-all page already reads a FRESH `getServerSession`, so `name`/`email`/`emailVerified` thread to `ProfileSection` as props through `UserPill` → shell. SSR-correct, no flash, no new dep.
- **REFACTOR folded into GREEN.** The plan's REFACTOR step ("extract a shared hash-recompute helper") was satisfied in the GREEN commit — `recomputeEmailHash` is the single body called by both hooks. No separate refactor commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `next build` type error — `authClient.useSession()` not callable**

- **Found during:** `docker compose build web` (production `next build`) before live E2E.
- **Issue:** GREEN's `ProfileSection` read the user via `authClient.useSession()`. In the vanilla `better-auth/client`, `useSession` is a nanostore Atom, not a React hook — Vitest mocked it as a function so the component test was green, but the production type-check failed.
- **Fix:** Server-seed `name`/`email`/`emailVerified` as props from the catch-all page's existing fresh `getServerSession`, threaded through `UserPill` → shell. Updated both component tests (props instead of a `useSession` mock; the shell test also needed a `useLocale` mock + `initialProfile` since it now mounts the real ProfileSection).
- **Files modified:** profile-section.tsx, user-pill.tsx, user-settings-shell.tsx, settings page.tsx, profile-section.test.tsx, user-settings-shell.test.tsx
- **Verification:** `docker compose build web` → compiled successfully; 17/17 settings component tests green; E2E green.
- **Committed in:** `4ec86b1`

---

**Total deviations:** 1 (1 blocking build fix).
**Impact on plan:** Surfaces a reusable rule — section components are server-seeded via props, never via a client `useSession` (there is no React hook for it here). Recorded for 10-04/10-06.

## Verification Results

- **Backend (real Postgres, from repo root):** `email-change-hash.test.ts` 2/2 + `email-templates.test.ts` 13/13 → **15 pass / 0 fail**. The critical assertion holds: after an email change, `email_hash` matches the NEW email, `findByEmail(new)` resolves, `findByEmail(old)` is null.
- **Component (Vitest+RTL):** `apps/web/test/settings/` → **17 pass / 0 fail** (profile-section 4 + shell 3 + the two pre-existing settings files).
- **Production build:** `docker compose build web api worker` → all three images built, TypeScript clean.
- **i18n parity:** `settings.profile` key sets identical across en/pl/uk.
- **Live E2E (budget-dev.madonzy.com):** `make test-e2e --grep @settings-profile` → **4 pass / 0 fail** (chromium + mobile × {change-name success notice, change-email confirmation notice on 375px}). Stack rebuilt + restarted (web for UI+i18n, api+worker for changeEmail config + change-email template + the update-after hook) before the run.

## Issues Encountered

- The nanostore-vs-hook gap (above) is the same class as the RSC server-only boundary lesson: a component can be Vitest-green and `next build`-red. Always run the production Docker build, not just Vitest, before claiming a frontend plan done.

## Next Phase Readiness

- 10-04 (Security) and 10-06 (Danger Zone) overwrite `security-section.tsx` / `account-danger-zone.tsx`. They should follow the server-seed-props rule for any user data (no `authClient.useSession`), and reuse `recomputeEmailHash` is N/A for them. The change-email template + changeEmail wiring are live in api+worker.

---

_Phase: 10-user-settings-redesign_
_Completed: 2026-06-26_
