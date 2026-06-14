---
status: testing
phase: 08-pwa-offline-push-i18n-e2e-hardening
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md, 08-06-SUMMARY.md, 08-07-SUMMARY.md
started: 2026-06-11T10:30:00Z
updated: 2026-06-11T10:30:00Z
---

## Current Test

number: 4
name: Offline Write — Pending Sync Marker (PWAX-03)
expected: |
Offline quick-entry shows row with Pending marker + red pulsing offline
badge; reconnect auto-syncs, marker clears.
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
result: pass
claude_verified: "2026-06-11 — manifest 200 (standalone, theme #0b0e11), 4 icons 200 image/png; Brave desktop install + iOS A2HS dialog user-confirmed in test 2 rounds."
note: "User installed on real iOS device via new A2HS instructions; standalone launch + icon confirmed."

### 4. Offline Write — REDESIGNED to robust-minimal (PWAX-03 superseded)

expected (NEW, after design change): Quick-entry an expense while offline → the optimistic row ROLLS BACK and an honest toast shows ("can't add right now / try again when reconnected"). NO queue, NO pending-sync marker, NO auto-replay. Online add unchanged. (Old expectation below is obsolete.)
design_change: "After ~8 UAT rounds the offline write-queue/sync proved too fragile on iOS (navigator.onLine lies; service-worker stale-cache masked every fix; replay 4xx on wrong tenant header). USER DECISION 2026-06-14: simplify to robust-minimal — offline is READ-only-reliable; offline WRITE is an honest toast + rollback. Implemented in quick-260614-q1v (removed queue/replay/pending-marker/sync-issues/offline.html). Test 6 (Sync Issues List) is therefore REMOVED (feature deleted). The long debug trail (i5m/ipk/kfw/nug) is retained below for history; superseded by q1v."
old_expected: Go offline (airplane mode/devtools offline). Quick-entry an expense — row appears immediately with Clock + "Pending" marker; offline badge shows red pulsing dot. Go back online — entry syncs automatically, pending marker clears, badge hides.
result: fix-deployed (awaiting device re-verify of the SIMPLIFIED behavior)
reported: "On device (iOS), offline quick-entry shows only a perpetual LOADING SPINNER next to the amount (e.g. '17') — NOT the Clock + 'Pending' marker. Stuck loading; no offline pending state."
severity: major
root_cause: "Offline fork keyed ONLY on navigator.onLine===false (use-create-transaction.ts:93); iOS reports onLine=true with no network → write took the online path; clientApiFetch had no timeout → POST hung forever → optimistic row pending:true never cleared (spinner). Clock/Pending marker gated on the IndexedDB queue entry that's only written in the skipped fork → never shown. Vitest passed because it force-set navigator.onLine=false + mocked fetch — never exercising the 'looks online but network dead' branch."
fix: "quick-260614-i5m (commits 5c576b3 RED, b7f74fd GREEN): write POST now uses AbortSignal.timeout(8000) + try/catch fallback — any network throw/timeout/5xx enqueues to the offline queue (same idempotency key → server dedupes, no double-write) and throws OfflineEnqueuedError → onError clears the spinner + the Clock/Pending marker shows. 4xx stays a real error (no replay loop). navigator.onLine kept only as a fast path."
claude_verified: "2026-06-14 — RED tests reproduced the device hang (navigator.onLine=true + fetch reject/AbortError → previously stuck pending); now GREEN. Suite 30/30 (offline-write-path/offline-queue/offline-status-badge/transaction-row-marker/use-online-sync/offline-shell-wiring); tsc+eslint clean; web rebuilt, served bundle confirmed contains AbortSignal.timeout(8e3) in the spendings route chunk. Real-device offline still the human confirmation (env-fragile to automate)."
round2_finding: "i5m fix WAS in the served bundle (confirmed 2 chunks) but device 'still the same' — installed iOS PWA never reloaded to run the new SW (no controllerchange auto-reload). Investigation also found: (a) useOnlineSync (reconnect queue-replay hook) was NEVER mounted = dead code → queue never auto-replays on reconnect; (b) post-reconnect 'Try again' screen = static offline.html whose retry gated strictly on /api/health 200 + iOS-unreliable online event → stuck until app restart."
round2_fix: "quick-260614-ipk (fd33304 SW-update auto-reload island; 53503b1 mount useOnlineSync + visibilitychange/focus reprobe + in-flight guard; 079cb7a robust offline.html retry navigates-anyway + backoff + reprobe; 7bc6bfa test cleanup). Full suite 720 pass; served live origin confirmed has new offline.html retry + controllerchange/visibilitychange in (app) layout chunk. DEVICE NOTE: old installed PWA must be force-closed ONCE to load the reloader build; thereafter deploys auto-reload."
round3_device_truth: "On-device diagnostics overlay (quick-260614-kfw, ?offdbg=1 OR profile Diagnostics switch, OFFDBG-2 + write-path trace) gave ground truth: device DOES run new code; navigator.onLine reports TRUE while offline (iOS lies) + offline event lags; offline write now ENQUEUES (queue 0→1) — i5m/ipk fork works once the build is loaded. BUT reconnect replay failed: queue 1 / failed 1 + 'could not sync' banner."
round3_root_cause: "useOnlineSync replay POST set no X-Budget-ID header; clientApiFetch derives X-Budget-ID from window.location.pathname ONLY (budget-fetch.ts:24-26). On reconnect the user is usually not on that budget's page → header missing → tenant guard 403 no_active_workspace → markQueueItemFailed → sync-issues. Server-proven: same POST without X-Budget-ID = 403 no_active_workspace; with X-Budget-ID = 201 created."
round3_fix: "quick-260614-nug (ec3066f RED, 14dcaef fix): stamp X-Budget-ID: item.budgetId on the replay POST (use-online-sync.ts) + X-Budget-ID: budgetId on the offline-write fallback POST (use-create-transaction.ts). use-online-sync 10/10 + offline suites green; served bundle confirmed has X-Budget-ID in replay+write paths; SERVER-VERIFIED 403→201 with uat-probe-1 on Optimistic Tapo (test txn cleaned up). USER ACTION: pre-existing stuck 'could not sync' item (failReason set) won't auto-retry by design — Dismiss it once, then test fresh."
claude_verified: "2026-06-11 — deterministic offline Vitest suite 9 files / 50 tests green (enqueue+idempotencyKey, write fork, pending marker show/clear, badge+sync-issues reactivity, replay 2xx/4xx/5xx, SW fallback, shell wiring); offline fork + txn-pending- testid present in served spendings chunk. 3 real-browser E2E scenarios @skip by design (env-fragile) — this UAT is the real-device validation. RE-VERIFIED 2026-06-14 post category-color migration + layout refactor: offline-write-path/offline-queue/offline-status-badge/offline-shell-wiring/use-online-sync 22/22 green; served live chunks still contain offline machinery."

### 5. Offline Read — Cached Budget + Staleness Marker (PWAX-02)

expected: Visit budget online first, then go offline and reload/navigate — previously viewed budget data (wallets, categories, transactions) still renders from cache, with "last updated X ago" staleness marker. Uncached area shows offline empty-state with WifiOff icon + retry button.
result: [pending]

### 6. Sync Issues List

expected: A queued offline entry that fails on replay (4xx) appears in sync-issues list with reason. Dismiss removes it with toast confirmation.
result: removed
reason: "Feature deleted in quick-260614-q1v (robust-minimal offline). No offline write-queue/replay anymore → no sync-issues to surface. Offline write is now an honest rollback+toast (test 4)."

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
passed: 3
issues: 0
pending: 9
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

- truth: "Bottom of scrollable pages reachable in iOS Safari browser (no content hidden behind the floating bottom bar)"
  status: resolved
  reason: "User reported (before test 4): in iOS Safari browser — not installed PWA — the bottom part of the Wallets page is truncated behind Safari's bottom bar"
  severity: major
  test: 4
  root_cause: "iOS Safari's floating bottom bar overlays the layout viewport; the (app) shell's <main> scroll surface had no env(safe-area-inset-bottom) clearance, so the final rows sat in the obscured zone. Standalone unaffected (no bar)."
  artifacts:
  - path: "apps/web/src/app/[locale]/(app)/layout.tsx"
    issue: "<main> scroll surface lacked bottom safe-area padding"
    missing:
  - "pb-[env(safe-area-inset-bottom)] on the shell scroll surface"
    debug_session: ""
    resolution: "FIXED 9a2bd51 (final; supersedes 1100fb3/f34ae02/25b8e31/6d25bf2/1b0cab8 partials). Root cause (device-measured via ?vpdbg overlay + user's google.com/home-assistant.io counter-evidence): iOS Safari collapses its bar and extends the viewport edge-to-edge only when the PAGE scrolls; the locked-body + inner-scroll architecture (needed for custom PTR) kept the bar expanded with a dead band beneath. Final design: @media (display-mode: browser) unlocks native page scroll (html/body auto, shell min-height 100lvh, main overflow visible, custom PTR bails — platform provides PTR + bar collapse; header scrolls away, BDP tab band sticky top-0 takes over). Standalone keeps locked body + custom PTR + 100lvh + env()+48px breathing room. Overrides UNLAYERED (Tailwind utility cascade). 7 regression guards in test/shell-safe-area.test.ts."

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
