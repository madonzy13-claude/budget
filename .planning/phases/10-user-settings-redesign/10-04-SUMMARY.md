---
phase: 10-user-settings-redesign
plan: 04
subsystem: ui
tags: [better-auth, password-reset, sessions, alert-dialog, next-intl, settings]

requires:
  - phase: 10-user-settings-redesign
    provides: User-pill accordion Security slot (10-02) + server-seeded profile.email (10-03)
  - phase: 01-foundations
    provides: orphaned sessions-list.tsx (revokeSession + AlertDialog) re-homed here
provides:
  - "Security section: email-gated password change (requestPasswordReset → /reset-password) + active-sessions list"
  - "SessionsList: per-row revoke + 'sign out all other devices' (revokeOtherSessions) behind one shared confirm dialog"
  - "settings.security.* + settings.sessions.sign_out_others.* / *_revoke_others i18n (en/pl/uk)"
affects: [10-05]

tech-stack:
  added: []
  patterns:
    - "Email-gated password change = ZERO backend change: reuse the already-wired reset flow (sendResetPassword + resetPasswordTokenExpiresIn) by calling authClient.requestPasswordReset({ email: self, redirectTo: /<locale>/reset-password }) — the password is set on the shared /reset-password page (10-05), never in settings"
    - "Client session read uses the CALLABLE authClient.listSessions()/getSession() (NOT the useSession nanostore atom — see 10-03); current row flagged by matching getSession().data.session.token"
    - "One Confirm-state ({kind:'revoke',session} | {kind:'others'}) backs a single AlertDialog for both destructive session actions (folds the planned REFACTOR into GREEN)"

key-files:
  created:
    - apps/web/test/settings/security-section.test.tsx
    - apps/web/test/settings/sessions-list.test.tsx
    - apps/web/e2e/features/settings-security.feature
    - apps/web/e2e/steps/settings-security.steps.ts
  modified:
    - apps/web/src/components/settings/security-section.tsx
    - apps/web/src/components/settings/sessions-list.tsx
    - apps/web/src/components/settings/user-pill.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json

key-decisions:
  - "Dropped the per-row Radix DropdownMenu (one action behind a menu = overkill) for a plain 'Sign out this session' button → the same confirm AlertDialog. Bonus: a state-driven AlertDialog is reliably testable in happy-dom (fireEvent), whereas a Radix dropdown opening on pointer events is not."
  - "Password-change email is gated to the account's OWN verified address (T-10-05): a hijacked session can fire the email but cannot set the password without the inbox + the 1800s token."
  - "E2E mints a SECOND session via a direct /auth/sign-in/email POST (fresh sign-in = new session row) so 'sign out all other devices' has something to revoke; the browser context keeps its original current session."

patterns-established:
  - "Reuse-the-reset-flow for in-app password change (no new endpoint, no pending table)"
  - "Single shared confirm dialog for multiple destructive variants"

requirements-completed: [USET-05]

duration: ~30min
completed: 2026-06-26
---

# Phase 10 Plan 04: Security Section (password + sessions) Summary

**The User-pill Security slot now offers an email-gated password change (reuses the existing reset flow — a button emails a link to the account's own address; the password is set on the shared /reset-password page, never in settings) and an active-sessions list with per-row revoke plus "sign out all other devices" (revokeOtherSessions), all behind one shared confirm dialog. Zero backend change. TDD: two component tests + live E2E.**

## Performance

- **Duration:** ~30 min (RED → GREEN/REFACTOR → E2E)
- **Completed:** 2026-06-26
- **Files:** 4 created, 6 modified

## Accomplishments

- `security-section.tsx`: "Change password" → `authClient.requestPasswordReset({ email, redirectTo: /<locale>/reset-password })` + toast; embeds the sessions list. `email` server-seeded via the existing `profile` prop (no client `useSession`). Sessions fetched with the callable `listSessions()` + `getSession()` (current row = matching session token).
- `sessions-list.tsx`: replaced the per-row Radix dropdown with a plain "Sign out this session" button; added "Sign out all other devices" (`revokeOtherSessions`, leaves only the current row); both behind ONE shared confirm AlertDialog (`Confirm` state).
- i18n: `settings.security.change_password.*` + `sessions_heading`/`sessions_loading`; `settings.sessions.sign_out_others.*` + `success/error_revoke_others` — en/pl/uk, parity verified.

## Task Commits

1. **RED** — `test(10-04): failing security section + sign-out-others tests`
2. **GREEN (+REFACTOR)** — `feat(10-04): security section — email-gated password change + sessions sign-out-others`
3. **E2E** — `test(10-04): security e2e — password-reset email + sign-out-others`

## Decisions Made

- **No backend change.** `requestPasswordReset` / `revokeOtherSessions` / `listSessions` are already-wired Better Auth client methods (1.6.16) — confirmed their server endpoints exist before building. The whole plan is client reuse, so only `web` was rebuilt (api/worker untouched).
- **Plain button over Radix dropdown for single-revoke.** One action does not need a menu; a state-driven AlertDialog is also reliably driveable in happy-dom (the Radix DropdownMenu open-on-pointer path is not), so RED/GREEN stay meaningful without flaky portal interaction.
- **REFACTOR folded into GREEN.** The planned "share the revoke confirm-dialog shape" landed directly as the single `Confirm` discriminated-union state backing one AlertDialog — no separate refactor commit.

## Deviations from Plan

**None blocking.** The plan grouped `sign_out_others` copy loosely under `settings.security.*`; it actually lives under `settings.sessions.*` (where `sessions-list.tsx` reads), keeping the namespace clean. Password copy is under `settings.security.*`. The single-revoke component test drives the new plain button (not the removed dropdown), matching the GREEN UI.

## Verification Results

- **Component (Vitest+RTL):** `apps/web/test/settings/` → **20 pass / 0 fail** (security 1 + sessions 2 added; profile 4 + shell 3 + 2 pre-existing).
- **i18n parity:** `settings.sessions` + `settings.security` key sets identical across en/pl/uk.
- **Production build:** `docker compose build web` → exit 0, TypeScript clean (no api/worker rebuild needed).
- **Live E2E (budget-dev.madonzy.com):** `make test-e2e --grep @settings-security` → **4 pass / 0 fail** (chromium + mobile × {change-password emails a link; a minted 2nd session makes "sign out all other devices" appear → confirming calls revokeOtherSessions live → the control disappears + success notice}).

## Next Phase Readiness

- The password-change button depends on the `/reset-password` consume page that **plan 10-05 builds** (it currently `redirectTo`s there). 10-05 also adds the logged-out forgot-password page + fixes the dead sign-in link. The reset email already fires correctly today; 10-05 makes the landing page real.

---

_Phase: 10-user-settings-redesign_
_Completed: 2026-06-26_
