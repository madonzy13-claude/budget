---
phase: 10-user-settings-redesign
plan: 05
subsystem: ui-auth
tags: [better-auth, password-reset, next-intl, auth-pages, settings]

requires:
  - phase: 02-identity
    provides: wired reset flow (sendResetPassword + resetPasswordTokenExpiresIn 1800s) + reset-password email template
provides:
  - "/[locale]/forgot-password — request-reset page (requestPasswordReset, neutral success)"
  - "/[locale]/reset-password — consume ?token=, min-10 new password, resetPassword → sign-in; error on bad/missing token"
  - "Fixed sign-in 'Forgot password?' link (was dead /reset-password → /forgot-password)"
  - "AuthCardShell shared brand+card frame for the logged-out password pages"
affects: [10-04]

tech-stack:
  added: []
  patterns:
    - "Both pages are self-contained 'use client' cards (UI primitives only, no NavLink chrome) so they call authClient directly (satisfies the page-level grep) AND stay test-light"
    - "reset page reads ?token via useSearchParams; the Better Auth email links the token as a PATH segment (/auth/reset-password/<token>?callbackURL=/<locale>/reset-password) which the GET handler redirects to /<locale>/reset-password?token=<token>"
    - "ZERO backend change — the reset email + 1800s token are already wired; these are the missing front-ends"

key-files:
  created:
    - apps/web/src/app/[locale]/forgot-password/page.tsx
    - apps/web/src/app/[locale]/reset-password/page.tsx
    - apps/web/src/components/auth/auth-card-shell.tsx
    - apps/web/test/auth/forgot-password.test.tsx
    - apps/web/test/auth/reset-password.test.tsx
    - apps/web/e2e/features/forgot-password.feature
    - apps/web/e2e/steps/forgot-password.steps.ts
  modified:
    - apps/web/src/app/[locale]/sign-in/page.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json

key-decisions:
  - "Neutral success on forgot regardless of whether the email is registered (T-10-07 no enumeration); requestPasswordReset errors are swallowed into the same success state."
  - "min-10 enforced client-side (mirrors better-auth minPasswordLength) AND server-side; a <10 password never calls resetPassword."
  - "Reused existing auth.reset.{request,consume,expired} copy; added only reset.{min_length,back_to_signin,request_new_link}."
  - "Self-contained cards skip the NavLink-based BrandMark/SiteFooter chrome — simpler + no NavPending context in tests; a plain brand wordmark keeps them on-brand."

patterns-established:
  - "AuthCardShell for logged-out auth utility pages"
  - "Reuse-the-reset-flow front-ends back BOTH the logged-out reset and the in-app password change (10-04)"

requirements-completed: [USET-07]

duration: ~35min
completed: 2026-06-26
---

# Phase 10 Plan 05: Forgot/Reset Password Pages Summary

**Built the two missing logged-out password pages and fixed the dead sign-in link. `/forgot-password` requests a reset link (neutral, no-enumeration success); `/reset-password` consumes `?token=`, enforces a 10-char minimum, calls `resetPassword`, and redirects to sign-in (error + request-new link on a bad/missing token). Sign-in's "Forgot password?" now points at `/forgot-password` (was a dead `/reset-password` with no token). Zero backend change. TDD: 4 component tests + 6 live E2E (golden through a real mailpit reset email).**

## Performance

- **Duration:** ~35 min (RED → GREEN → REFACTOR → E2E + one E2E token-format fix)
- **Completed:** 2026-06-26
- **Files:** 7 created, 4 modified

## Accomplishments

- `forgot-password/page.tsx`: email form → `authClient.requestPasswordReset({ email, redirectTo: /<locale>/reset-password })` → always the neutral success copy.
- `reset-password/page.tsx`: `useSearchParams().get("token")`; min-10 new-password form → `authClient.resetPassword({ newPassword, token })` → `router.push(/<locale>/sign-in)`; missing/expired token → error + "request a new link".
- `sign-in/page.tsx`: repointed the "Forgot?" link `/reset-password` → `/forgot-password`.
- `AuthCardShell`: extracted the shared brand+card frame (REFACTOR).
- i18n: reused `auth.reset.*`; added `reset.{min_length,back_to_signin,request_new_link}` en/pl/uk.

## Task Commits

1. **RED** — `test(10-05): failing forgot/reset page tests`
2. **GREEN** — `feat(10-05): forgot/reset-password pages + sign-in link fix`
3. **REFACTOR** — `refactor(10-05): share auth-card shell across forgot/reset pages`
4. **E2E** — `test(10-05): forgot-password e2e (golden + expired token + link fix)`

## Decisions Made

- **No backend change.** The reset email + 1800s single-use token are already wired (`sendResetPassword`, `resetPasswordTokenExpiresIn`); only `web` was rebuilt.
- **Self-contained cards.** Skipped the NavLink-based chrome so the pages can be `"use client"` (call `authClient` directly per the grep criteria) and stay test-light — a plain "Budget" wordmark keeps them on-brand.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Non-blocking] E2E reset-token extraction — token is a PATH segment, not a query param**

- **Found during:** first `make test-e2e --grep @forgot-password` (golden failed; expired + link scenarios passed).
- **Issue:** the step poller looked for `?token=` in the reset email, but Better Auth links the token as a PATH segment: `/auth/reset-password/<TOKEN>?callbackURL=/en/reset-password` (its GET handler validates the token then redirects to `<callbackURL>?token=<TOKEN>`). No `token=` in the email → poller timed out.
- **Fix:** extract the token from the `/auth/reset-password/<token>` path (fallback to `?token=`), then open `/<locale>/reset-password?token=<token>` directly.
- **Files modified:** apps/web/e2e/steps/forgot-password.steps.ts (test-only; no rebuild)
- **Verification:** `make test-e2e --grep @forgot-password` → 6/6 green.
- **Committed in:** the E2E commit.

**Extra file:** added `AuthCardShell` (not in the plan's files list) as the REFACTOR artifact — the plan's REFACTOR step asked for exactly this extraction.

## Verification Results

- **Component (Vitest+RTL):** `apps/web/test/auth/` → **4 pass / 0 fail** (forgot 1 + reset 3: sets >=10 + redirects; rejects <10 with no call; missing-token error + /forgot-password link).
- **i18n parity:** `auth.reset` key set identical across en/pl/uk.
- **Production build:** `docker compose build web` → exit 0, TypeScript clean.
- **Live E2E (budget-dev.madonzy.com):** `make test-e2e --grep @forgot-password` → **6 pass / 0 fail** (chromium + mobile × {golden request→real-email-token→set-password→sign-in; missing-token error; sign-in link → /forgot-password}).

## Next Phase Readiness

- This closes the loop opened by 10-04: the in-app "Change password" button's `redirectTo /reset-password` now lands on a real consume page. Only **10-06 (Danger Zone account deletion)** remains — `autonomous: false`, so it requires a human checkpoint before the destructive cascade.

---

_Phase: 10-user-settings-redesign_
_Completed: 2026-06-26_
