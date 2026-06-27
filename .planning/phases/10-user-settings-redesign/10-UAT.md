---
status: testing
phase: 10-user-settings-redesign
source:
  [
    10-01-SUMMARY.md,
    10-02-SUMMARY.md,
    10-03-SUMMARY.md,
    10-04-SUMMARY.md,
    10-05-SUMMARY.md,
    10-06-SUMMARY.md,
  ]
started: 2026-06-26T17:44:00Z
updated: 2026-06-27T06:24:00Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: 3
name: Profile — Change Name + Request Email Change
expected: |
User ▸ Profile: editing account name + saving persists it; requesting an
email change sends a confirm link to the CURRENT address; pending badge until
confirmed; new email works for sign-in (email_hash stays in sync).
awaiting: user response

## Tests

### 1. Cold Start Smoke Test

expected: Stack boots from scratch — all services healthy, migration 0045 applied (preferred_llm_provider / preferred_stt_provider dropped), health endpoint + authenticated /settings load with no error.
result: pass

### 2. Settings Shell — Single Stacked Accordion + Provider Removed

expected: /settings is ONE stacked accordion (NO pills): General (open by default — Display language + Display currency), Profile, Security, Danger Zone. NO Providers/AI/voice tab anywhere. Clicking a section header expands it. [Redesigned from the 2-pill carousel per user request mid-UAT — commit 52f9f48.]
result: pass

### 3. Profile — Change Name + Request Email Change

expected: In User ▸ Profile, editing the account name and saving persists it. Requesting an email change sends a confirmation link to the CURRENT (old) address; a "pending" badge shows until confirmed; after confirming, the new email works for sign-in (email_hash stays in sync).
result: [pending]

### 4. Security — Password Change + Active Sessions

expected: In User ▸ Security, "Change password" emails a reset link to your own address (set on the /reset-password page, never inline). Active-sessions list shows your sessions with per-row "Sign out this session" and "Sign out all other devices", each behind a confirm dialog; confirming revokes.
result: [pending]

### 5. Forgot / Reset Password Pages

expected: /forgot-password requests a reset link with a neutral success message (same whether or not the email is registered). The emailed link opens /reset-password, enforces a 10-char minimum, sets the new password, and redirects to sign-in. Sign-in's "Forgot password?" link points at /forgot-password (not a dead /reset-password).
result: [pending]

### 6. Danger Zone — Account Deletion (GDPR)

expected: In User ▸ Danger Zone, deletion requires typing DELETE then a confirmation email. Confirming the emailed link runs the cascade: solely-owned budgets + their data are purged, the account is deleted, and the old credentials are rejected at sign-in. (Sole owner of a SHARED budget with other members is blocked with remediation.)
result: [pending]

## Summary

total: 6
passed: 2
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

- truth: "Global display currency defaults to the user's first budget's currency (set at budget creation), staying USD/unset until then — unless the user already chose one."
  status: fixed
  reason: "Surfaced during Test 2. display_currency hard-defaulted to USD (NOT NULL) so it never reflected the first budget; the home-summary's fallback-to-budget-currency was also dead code."
  severity: major
  test: 2
  root_cause: "identity.users.display_currency was NOT NULL DEFAULT 'USD' (schema.ts + Better Auth additionalFields defaultValue); never synced to the first budget."
  fix: "Column nullable + no default (migration 0046); Better Auth field required:false; setDisplayCurrencyIfUnset(id, ccy) seeds it on first budget create (only-if-NULL, never clobbers a manual pick); findById coalesces NULL->USD."
  commit: eb9d70a
  verified: "TDD real-PG display-currency-default.test.ts 5/0; budgets route 7/0; monorepo typecheck clean; live: fresh user NULL -> EUR first budget -> EUR in DB + settings picker."

- truth: "Settings is a single stacked accordion (General first), not a 2-pill carousel."
  status: fixed
  reason: "User requested mid-UAT: remove pills; render everything as sections with General as the first section."
  severity: enhancement
  test: 2
  fix: "user-settings-shell.tsx rewritten to one multi-open Accordion (General/Profile/Security/Danger, General default-open); pushState carousel + user-pill.tsx removed; settings.pills.\* i18n removed, settings.user.sections.general added (en/pl/uk); e2e steps expand their section."
  commit: 52f9f48
  verified: "settings component tests 20/0; web build clean; live no-pills accordion (General open, currency EUR); e2e @settings-profile 4/0, @settings-security 4/0, @settings-danger 2/0."

- truth: "Settings polish: currency reads as a tappable field; saved name persists immediately; loading skeleton matches the accordion."
  status: fixed
  reason: "User double-check (phone): (1) display currency rendered as bare text, not obviously clickable; (2) name snapped back to the old value after Save, only correct after reload; (3) the loading template still showed the old pill bar."
  severity: minor
  test: 2
  fix: "(1) DisplayCurrencyPicker passes variant='field' (border + chevron on touch, matching the language select); (2) profile-section keeps the just-saved name (setNameEdit(nameValue) not null); (3) settings loading.tsx rewritten to the accordion skeleton (no pills)."
  commit: d85814b
  verified: "settings vitest 21/0 (name-persist test added); web rebuilt; live: name keeps value after Save with no reload. #1 (touch field) + #3 (skeleton) pending phone re-check."

- truth: "Renaming updates the header profile menu immediately; the menu has no Diagnostics item."
  status: fixed
  reason: "User double-check: (1) after a name change the header profile mini-menu (name + avatar initials) stayed on the old value until reload; (2) Diagnostics should not be in the menu."
  severity: minor
  test: 3
  fix: "(1) profile-section calls router.refresh() after a successful name save → TopNav re-renders with the cookie-cache-refreshed session; (2) removed the TEMPORARY Diagnostics item + toggleVpdbg import from profile-menu.tsx."
  commit: 5792405
  verified: "Live: rename -> avatar initials MU + menu name 'Menu Update Test' update with NO reload; menu shows Profile/Settings/Install app/Sign out only (no Diagnostics)."

- truth: "Email change follows Better Auth's native two-step flow and the user is clearly told about BOTH confirmations; the new address is auto-verified + auto-signed-in on the second click (no forced logout, no unverified-login gate)."
  status: fixed
  reason: "User double-check raised 4 points (logout on change, stale email after change, confirm-request message, verify-new-email notice). Building the literal single-step/unverified model revealed Better Auth 1.6.11's change-email is TWO clicks: the OLD-address link changes NOTHING (it emails a verify link to the NEW address); the NEW-address link applies the change, sets emailVerified=true, and re-issues a session cookie (auto-login). The original revoke-all-sessions + 'verify your new email' landing fought that design — the email never actually changed in my first UAT pass."
  severity: major
  test: 3
  root_cause: "verifyEmail handler (better-auth/dist/api/routes/email-verification.mjs): requestType 'change-email-confirmation' only re-sends to the new address; 'change-email-verification' does updateUserByEmail({email,emailVerified:true}) + setSessionCookie. So the new email is never in an unverified/login-blocked state, and a session-revoke hook deletes the just-issued auto-login session."
  fix: "Per user decision (do it Better-Auth's way, notify about both confirmations, skip session removal): (1) reverted the update.after hook to email_hash recompute ONLY — dropped onUserUpdated/emailChanged/revokeAllUserSessions (better-auth.ts); (2) /email-changed reworked to a session-aware two-stage landing — both clicks reuse one callbackURL, so changeEmail passes the target as ?to= and the page compares it to the LIVE session email: not-equal/signed-out → PENDING ('open the verify link in your new inbox', stay logged in); equal → DONE ('email updated, signed in with your new address', Continue into app). No signOut; ignores the stray &error= a duplicate proxy hit can append; (3) settings inline confirm_pending reworded to spell out BOTH steps ('email changes only after step 2'); (4) en/pl/uk keys updated."
  commit: pending
  verified: "Component: email-changed-page.test.tsx 3/0 (pending/done/signed-out) + profile-section.test.tsx 6/0 (added next/navigation mock + confirm-notice test); identity email-change-hash.test.ts 2/0 (real-PG, recompute intact). Typecheck web+identity clean. e2e @settings-profile 2/0. LIVE (fresh user, full path): inline two-step message shows both addresses → OLD-address click → /email-changed PENDING (still logged in) → NEW-address click → /email-changed DONE → app, profile menu + settings Profile both show the NEW email, verified, no pending badge; DB email_verified=t. Note: a browser/proxy double-fire put &error=USER_NOT_FOUND on the 2nd hit — page renders correctly from session regardless (single fetch = 1 hit, so it's a proxy artifact not a server double-send)."
