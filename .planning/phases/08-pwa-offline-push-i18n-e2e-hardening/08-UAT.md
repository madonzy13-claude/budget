---
status: testing
phase: 08-pwa-offline-push-i18n-e2e-hardening
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md, 08-06-SUMMARY.md, 08-07-SUMMARY.md
started: 2026-06-11T10:30:00Z
updated: 2026-06-11T10:30:00Z
---

## Current Test

number: 3
name: PWA Install on Real Mobile Device (PWAX-01 — manual)
expected: |
Mobile install from https://budget-dev.madonzy.com works; icon dark+yellow;
launches standalone. iOS path already captured as gap (test 2) — Android/
desktop install validates the manifest side.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test

expected: Full stack restart from scratch — all services healthy, migrations applied (incl. 0032 push tables), https://budget-dev.madonzy.com loads, sign-in works.
result: pass
claude_verified: "2026-06-11 — make down + make dev x2; all services healthy; push_subscriptions + notification_prefs tables present; Playwright sign-in via tunnel OK; budget list renders live data. ci-gate exit 0 (10 files); Vitest 571 pass/43 skip. Note: React #418 hydration warning on /en home console."

### 2. Install Banner + "Install app" Profile Entry (desktop browser)

expected: On supported browser (Chrome/Edge, not yet installed), yellow-tint install ribbon appears above header with Install / dismiss / Learn-more dialog (3 benefits). Dismiss hides it persistently (localStorage). Profile menu shows "Install app" entry when not running standalone.
result: pass
note: "Initially failed (2 issues, see Gaps — both resolved inline: bf5796e, 17b777c, afb6c36). Re-verified pass by user after round-4 fixes (mobile-only suggestion banner, iOS A2HS dialog, installed-detection hides banner + profile entry)."
claude_verified: "2026-06-11 — Playwright live: banner renders with all 3 actions; Learn-more dialog lists 3 benefits; profile menu shows Install app; dismiss sets pwa-install-dismissed=1 and banner stays hidden after reload (localStorage restored after check). Vitest install-banner.test.tsx green."

### 3. PWA Install on Real Mobile Device (PWAX-01 — manual)

expected: From mobile Chrome/Safari at https://budget-dev.madonzy.com, install/Add-to-Home-Screen works. App icon is dark canvas + yellow accent. Launches standalone (no browser chrome), theme color dark.
result: [pending]

### 4. Offline Write — Pending Sync Marker (PWAX-03)

expected: Go offline (airplane mode/devtools offline). Quick-entry an expense — row appears immediately with Clock + "Pending" marker; offline badge shows red pulsing dot. Go back online — entry syncs automatically, pending marker clears, badge hides.
result: [pending]

### 5. Offline Read — Cached Budget + Staleness Marker (PWAX-02)

expected: Visit budget online first, then go offline and reload/navigate — previously viewed budget data (wallets, categories, transactions) still renders from cache, with "last updated X ago" staleness marker. Uncached area shows offline empty-state with WifiOff icon + retry button.
result: [pending]

### 6. Sync Issues List

expected: A queued offline entry that fails on replay (4xx) appears in sync-issues list with reason. Dismiss removes it with toast confirmation.
result: [pending]

### 7. Push Preferences in Settings

expected: Settings → Notifications accordion. Master switch triggers browser permission prompt; granting subscribes (switch stays ON), denying snaps switch OFF with toast. With master ON, three per-kind switches appear (Reserve top-up, Confirm draft, Cushion below target), each toggleable with saved toast.
result: [pending]

### 8. Real Push Delivery + Deep-Link (PWAX-04 — manual)

expected: With push enabled on device, trigger a RESERVE_TOPUP task (wallet balance update). Push notification arrives (generic text, no amounts). Tapping it opens/focuses app on BDP tab with that task's banner row auto-expanded.
result: [pending]

### 9. Onboarding Push Step (new user)

expected: Brand-new account onboarding wizard now has 5 steps including a push notification step with a switch and "Skip for now". Skipping still completes wizard and lands on spendings.
result: [pending]

### 10. Locale Negotiation (Accept-Language)

expected: Fresh browser (no cookie, signed out) with Polish browser language lands on /pl Polish UI. English browser stays on /en. URL locale prefix and cookie still win over header.
result: [pending]

### 11. PL/UK Translation Quality — New Strings (I18N-02 — manual)

expected: Switch UI to PL then UK. New strings (install banner, push settings, onboarding push step, offline/sync/server-down messages) read naturally — no machine-translation howlers, no missing keys, no English leakage.
result: [pending]

### 12. Server-Down Screen (signed-out)

expected: With API stopped and signed out, app shows server-down card with single Reload button (no links). Optional/destructive — may skip.
result: [pending]

## Summary

total: 12
passed: 2
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps

- truth: "Profile menu 'Install app' entry installs the app whenever the browser supports installation"
  status: resolved
  reason: "User reported: desktop Brave — banner install works, but profile entry shows 'Install not available in this browser'"
  severity: major
  test: 2
  root_cause: "Single-shot BeforeInstallPromptEvent. install-banner.tsx handleInstall() calls prompt.prompt() then setDeferredPrompt(null); browsers never refire beforeinstallprompt in the same page session, so profile-menu.tsx getDeferredPrompt() returns null and falls to the notAvailable toast. Same dead end if the event was consumed/never captured. No appinstalled listener to distinguish 'already installed' from 'unsupported browser'."
  artifacts:
  - path: "apps/web/src/components/common/install-banner.tsx"
    issue: "handleInstall consumes the deferred prompt and nulls the store regardless of userChoice outcome"
  - path: "apps/web/src/components/auth/profile-menu.tsx"
    issue: "Install entry treats empty store as 'browser unsupported'; misleading after install or dismissal of the native prompt"
  - path: "apps/web/src/lib/pwa-install-store.ts"
    issue: "Store has no 'installed' / 'consumed' state, only prompt | null"
    missing:
  - "Only null the store when userChoice === 'accepted'; keep prompt reusable after native-prompt dismissal"
  - "Listen for appinstalled; track installed state; profile entry should say 'already installed' (or hide) instead of notAvailable"
    debug_session: ""
    resolution: "FIXED bf5796e + 17b777c + afb6c36 — final design per user: banner is install-suggestion only, mobile-only (sm:hidden; desktop uses profile-menu entry). Installed state (appinstalled persisted + Chromium prompt-silence heuristic in install-detect.ts: SW-controlled + no beforeinstallprompt in 2.5s ⇒ session-only flag, late prompt reverses) hides banner AND profile entry. Open-app banner mode removed per UAT feedback. Learn-more dialog restructured (icon rows, bold title + muted detail), 'browser chrome' jargon dropped EN/PL/UK. iOS remains undetectable by platform design — X-dismiss persists there. TDD: 33 tests."

- truth: "iOS Safari users can install the PWA (PWAX-01 covers real mobile devices)"
  status: resolved
  reason: "User reported: no banner in Safari on iOS; profile entry shows 'Install not available in this browser'"
  severity: major
  test: 2
  root_cause: "iOS Safari has no beforeinstallprompt event at all — programmatic install impossible by platform design. Only path is manual Share → Add to Home Screen. App ships no iOS-specific instructions, so iOS (primary mobile platform for a mobile-first PWA) gets a dead-end toast."
  artifacts:
  - path: "apps/web/src/components/common/install-banner.tsx"
    issue: "Banner renders only when beforeinstallprompt fires — never on iOS"
  - path: "apps/web/src/components/auth/profile-menu.tsx"
    issue: "notAvailable toast instead of iOS Add-to-Home-Screen guidance"
    missing:
  - "Detect iOS Safari (userAgent/platform + !standalone); show A2HS instruction banner/dialog: Share button → Add to Home Screen, with localized strings (EN/PL/UK)"
  - "Profile-menu install entry on iOS opens the same instruction dialog instead of toast"
    debug_session: ""
    resolution: "FIXED bf5796e — isIos() detection (UA + iPadOS touch heuristic); banner renders on iOS without prompt; CTA + profile-menu entry open IosInstallDialog with 3 localized A2HS steps (EN/PL/UK, i18n gate green)."
