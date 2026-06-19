---
status: testing
phase: 08-pwa-offline-push-i18n-e2e-hardening
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md, 08-06-SUMMARY.md, 08-07-SUMMARY.md
started: 2026-06-11T10:30:00Z
updated: 2026-06-19T13:15:00Z
---

## Current Test

[testing complete — all 13 resolved (12 pass, 1 removed). Test 12 was redesigned
mid-UAT into the server-down cached banner + read-only (built + live-verified,
awaiting user device double-check). Tests 9–12 newly passed this session; Test 10
also fixed a real locale-precedence bug.]

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
result: pass
user_confirmed: "2026-06-17 — device-verified the robust-minimal offline write (dialog + no row, no pending marker). FOLLOW-UP REQUIREMENT: user wants the SAME honest-offline behavior for ALL data changes (wallets, reserves, categories, settings, etc.), not just transaction quick-entry. Tracked as Test 13 (offline write consistency across all mutations)."
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

### 5. Offline Read — Cached Budget + Staleness Bar (PWAX-02)

expected (NEW, after tasks-redesign SPA/SWR refactor 2026-06-16/17): Visit a budget online first (opening it prefetches all four tab drivers), then go offline and reload/navigate — previously viewed budget data still renders from the **persisted React Query cache** (IDB `budget-rqcache`, 365d). A full-width red **`OfflineStaleBar`** sits below the header showing this page's own freshness: "Offline — data updated X ago" if cached, or **"Offline — data never cached"** if the current page's primary data was never fetched online. In-app navigation offline does a SW-served hard nav; a true nav cache-miss lands on `offline-shell.html` with a **Back** button (no blank/black screen). Month nav works offline (history.pushState).
design_change: "The IndexedDB cache + `getSyncMeta` staleness marker (08-04) were removed in the SPA/SWR refactor. Offline read is now the persisted React Query cache; cache-age is `OfflineStaleBar` + `useCacheAge` (per-page, 3-state). The old `OfflineFallback` WifiOff empty-state still exists but the primary nav-miss UX is the offline-shell Back button. ⚠️ The 'never cached' + no-data offline states are Vitest-only verifiable — Playwright's setOffline does NOT block the SW's API fetches; confirm on a real device. See memories project_offline_architecture / project_spa_swr_refactor / project_nav_cache_lag."
old_expected: Visit budget online first, then go offline and reload/navigate — previously viewed budget data (wallets, categories, transactions) still renders from cache, with "last updated X ago" staleness marker. Uncached area shows offline empty-state with WifiOff icon + retry button.
result: pass
user_confirmed: "2026-06-18 — device-confirmed offline cached read + staleness bar + month nav."
claude_verified: "2026-06-18 — covered by Test 13's offline work: persisted RQ cache holds all 12 tab keys (verified IDB snapshot); OfflineStaleBar 3-state (synced/never/unknown) Vitest 7/7 + live 'less than a minute ago'; offline nav = SW-served hard-nav (cold-start budget open renders, no black); offline-shell Back on cache-miss (sw-offline tests). Month nav offline LIVE-verified just now: prev-month → ?month=2026-05, label 'May 2026', document sentinel survived = history.pushState (no reload/hang). NOTE: the 'never cached' empty state is Vitest-only verifiable — Playwright setOffline doesn't block the SW's API fetches; confirm on a real device."

### 6. Sync Issues List

expected: A queued offline entry that fails on replay (4xx) appears in sync-issues list with reason. Dismiss removes it with toast confirmation.
result: removed
reason: "Feature deleted in quick-260614-q1v (robust-minimal offline). No offline write-queue/replay anymore → no sync-issues to surface. Offline write is now an honest rollback+toast (test 4)."

### 7. Push Preferences in Settings

expected: Settings → Notifications accordion. Master switch triggers browser permission prompt; granting subscribes (switch stays ON), denying snaps switch OFF with toast. With master ON, three per-kind switches appear (Reserve top-up, Confirm draft, Cushion below target), each toggleable with saved toast.
result: pass
user_confirmed: "2026-06-18 — device-verified: enabling the Notifications master switch triggered the iOS permission prompt; granting subscribed (switch stayed ON) and a NEW push_subscription row appeared in shared_kernel.push_subscriptions for the budget (endpoint web.push.apple.com/QBSUf7v…, 11:52:31). This subscription is what delivered Test 8's push. Re-exercised cleanly on the fresh reinstall."
claude_verified: "2026-06-18 — found + fixed 3 bugs blocking this: (1) GET /push/preferences was called WITHOUT the required ?budgetId query → 400 → saved prefs never loaded; (2) master keyed ON off 'any prefs exist', but getPreferences returns 3 DEFAULT rows for every budget → master wrongly showed ON for never-subscribed users; fixed to derive master from the real pushManager.getSubscription() (per-device truth) and load per-kind from prefs(budgetId); (3) NEXT_PUBLIC_VAPID_PUBLIC_KEY was NOT provisioned in the web build (Dockerfile lacked the ARG) → empty applicationServerKey → subscribe silently failed. Added the Dockerfile ARG + docker-compose build.arg and rebuilt web with the key INLINED (verified in served bundle). push-prefs-section Vitest 7/7 (incl. 2 new regression tests); live: Notifications master shows OFF for never-subscribed (was wrongly ON), GET 200. Subscribe device-confirmed (see user_confirmed)."
per_budget_fix_260618: "User reported (post-Test-9): (A) didn't enable notifications but Settings showed them enabled; (B) enabling in one budget enabled it in ALL budgets. ROOT CAUSE: the Test-7 fix keyed master off pushManager.getSubscription() — which is DEVICE-GLOBAL (one push subscription per browser), so once subscribed in any budget master showed ON everywhere; and push_subscriptions had a GLOBAL unique(endpoint) + the subscribe route IGNORED budgetId (stored under tenantIds[0]), so per-budget was impossible and RLS (visibility by tenant_id) meant only one budget could ever deliver. FIX (per-budget, RLS-aligned): migration 0037 swaps unique(endpoint) → unique(endpoint, tenant_id) so one device endpoint holds one row PER budget; subscribe route now requires budgetId, verifies membership (budgetId ∈ session tenantIds → 403 else), and stores tenant_id = budgetId; upsert conflict target = (endpoint, tenant_id); new repo isSubscribedForBudget + GET /push/subscription-status?budgetId&endpoint backs a PER-BUDGET master; client reads device endpoint then asks the server if THIS budget is subscribed (no endpoint / no row → OFF); turning master OFF DELETEs only this budget's row (keeps the device endpoint for other budgets — no pushManager.unsubscribe). VERIFIED: api push.test 15/15 (incl. per-budget status true-only-for-subscribed-budget, 403 forbidden budget, delete→false); push-prefs-section Vitest 9/9 (incl. 'device subscribed but NOT for this budget → master OFF' (Bug B guard), 'no device sub → OFF + no status call', 'turning OFF deletes only this budget's row'); migration applied (index push_subscriptions_endpoint_tenant_uq present); live route reachable (401 unauth, not 404); api+worker+web rebuilt+healthy. DB state: of uat-probe-1's 17 budgets, only 'Optimistic Tapo' has a sub row → it shows ON, all others OFF. Awaiting user device re-check."

### 8. Real Push Delivery + Deep-Link (PWAX-04 — manual)

expected: With push enabled on device, trigger a RESERVE_TOPUP task (wallet balance update). Push notification arrives (generic text, no amounts). Tapping it opens/focuses app on BDP tab with that task's banner row auto-expanded.
result: pass
user_confirmed: "2026-06-18 — device-confirmed: injected a task.created (RESERVE_TOPUP) → generic push notification arrived (no amounts) → TAPPING it opened the app on the Reserves tab (the deep-link target). Took several rounds to land because of TWO compounding issues (see root_cause); final tap landed correctly after the durable cache-based deep-link + a PWA reinstall to clear a stale iOS service worker."
root_cause: "Two issues. (1) DEEP-LINK on iOS: the SW could not route the open window from notificationclick — clients.matchAll() is frequently EMPTY on a standalone iOS PWA, and both WindowClient.navigate() AND clients.openWindow() merely REFOCUS the existing window without changing the route. So navigate()/postMessage attempts all fell through to openWindow → user stayed on the budget list. (2) STALE SW: iOS pins the service worker and updates it on its own cycle independent of the page — the page bundle updated over the network (proven) but the device kept running an OLD notificationclick across 4 swipe-reopens, so even correct new SW code never ran."
fix: "(a) DURABLE DEEP-LINK (SW-navigation-independent): sw.ts notificationclick now PERSISTS the target url to a Cache entry (budget-deeplink / **pending_deeplink**) BEFORE the best-effort focus/postMessage/openWindow. New page-side bridge components/common/sw-deep-link-nav.tsx (mounted in [locale]/layout, present on every route) reads + clears that entry on the next FOREGROUND transition (visibilitychange→visible / focus / mount / SW message) and navigates via location.assign. It POLLS the cache ~8×300ms after each foreground event to win the SW-write-vs-page-visible race. This path works on iOS, Android, desktop, and cold start. (b) the device's stale SW was cleared by REINSTALLING the PWA (forces a fresh SW registration)."
claude_verified: "2026-06-18 — page-side consumer PROVEN on the LIVE deployed bundle via Playwright: injected **pending_deeplink**='/en/sign-up?task=probe' into the budget-deeplink cache, dispatched focus/visibilitychange → page navigated /en/sign-in → /en/sign-up?task=probe (auth-independent proof of cache→foreground→assign). sw-deep-link-nav Vitest 6/6 (mount/foreground/no-pending/same-route-skip/SW-message/cleanup). Worker push-send (push-notification-handler) 9/9 incl. locale-prefixed deep-link url /<locale>/budgets/<id>/<tab>?task=<id>. Served sw.js verified to contain the push handler + cache-write (**pending_deeplink** / budget-deeplink); served [locale]/layout client chunk contains the consumer. VAPID fully wired (web inlines NEXT_PUBLIC_VAPID_PUBLIC_KEY==api VAPID_PUBLIC_KEY; api+worker hold all 3). Final device tap → Reserves (user_confirmed). NOTE FOR FUTURE DEVICE TESTS: iOS may keep a stale SW across swipe-reopens; if a SW-code change won't take, REINSTALL the PWA."

### 9. Onboarding wizard — push opt-in folded into Features (new user)

expected: New account (no budget) lands on the wizard. Stepper = 4 steps (Type, Basics, Features, Review) after a Welcome screen. NO standalone Push step, NO Skip button — advance via Next. The push opt-in is a toggle ("Enable push notifications") on the FEATURES step beside Cushion + Reserves. Completing ("Create budget") lands on the new budget's Spendings page; no forced scrollbar on a short step at phone size.
result: pass
user_confirmed: "2026-06-19 — device-confirmed: new account landed on the wizard; 4-step stepper, no standalone Push step, no Skip button, push toggle on the Features step, completing landed on Spendings."
claude_verified_260619: "2026-06-19 — re-verified before handing to user. (1) Vitest test/onboarding 22/22 (wizard-page + wizard-stepper). (2) Code truth: push switch lives in step-features.tsx (testid onboarding-push-switch); StepPush component gone. (3) LIVE Playwright-MCP walk on the deployed bundle (budget-dev.madonzy.com, fresh verified account uat-walk-…): sign-in → redirected to /budgets/new → stepper [Type,Basics,Features,Review] + Welcome 'Get started' → Type (Personal/Shared, only Next) → Basics (name input, zero Skip buttons in DOM) → Features showed 'Enable push notifications' toggle beside Cushion/Reserves and it flipped aria-checked=true → Review → 'Create budget' → landed on /budgets/<id>/spendings. (4) E2E onboarding.feature @phase8 3/3 green in chromium+mobile+geom-320. Awaiting user device double-check."
claude_verified: "2026-06-18 — wizard is a 6-segment machine (Welcome + Type/Basics/Features/Push/Review = 5 stepper steps); Push is step 4 with a switch (data-testid onboarding-push-switch) + a 'Skip for now' (StepPush + WizardLayout both expose a skip on steps 2-4). onSkip advances 4→5; commit POSTs /budgets, PUTs onboarding/progress, then window.location.assign(/<locale>/budgets/<id>/spendings). Vitest wizard-page 12/12 incl. 2 NEW Test-9 cases (push step renders switch+skip; skipping completes → asserts assign('/en/budgets/budget-123/spendings')). E2E (playwright-bdd, LIVE localhost) onboarding.feature @phase8 BOTH scenarios pass: 'New user completes the wizard' (push switch present → lands on spendings) + 'push step can be skipped' (skip → complete → spendings). NOTE: form.pushEnabled is captured but NOT acted on in commit — onboarding does not actually subscribe (real subscribe is Settings, Test 7); within Test 9's stated scope (step exists + skip completes + lands on spendings)."
push_now_honored_260618: "User reported: enabled the push checkbox in the wizard but Settings showed it OFF. ROOT CAUSE: form.pushEnabled was captured but NEVER acted on in commit (no subscribe). FIX: extracted shared lib/push-subscribe.ts subscribeToPushForBudget(budgetId) (permission → pushManager.subscribe → POST /push/subscribe with budgetId; best-effort, never throws). commitWizard now calls it for the new budget when pushEnabled, AFTER the POST /budgets returns the id. push-prefs-section refactored to use the SAME helper (Settings + onboarding stay in lockstep). VERIFIED: push-subscribe Vitest 4/4 (granted→posts budgetId / denied→no post / unsupported / server-error); wizard-page Vitest +2 ('enabling push subscribes the new budget at commit' asserts subscribeToPushForBudget('budget-123'); 'NOT enabling → no subscribe call'); push-prefs 9/9 after refactor; onboarding E2E @phase8 3/3 live (best-effort subscribe doesn't block — Playwright denies permission, budget still completes). web rebuilt+healthy. So: wizard push ON → real per-budget subscription → Settings shows ON for that budget."
redesign_260618: "User requested 3 wizard improvements (UAT): (1) MOVE push into the Features step (no standalone Push step); (2) mobile wizard scrolled even with no overflow content — scroll only on real overflow; (3) REMOVE the footer Skip button entirely. Implemented: wizard is now a 5-segment machine (Welcome + Type/Basics/Features/Review = 4 stepper steps). StepPush deleted; its switch (testid onboarding-push-switch) + new i18n onboarding.wizard.features.push_label/push_help (EN/PL/UK) moved into StepFeatures as a 3rd FeatureRow. WizardLayout Skip button + showSkip removed; every step advances via Next (Type/Features have defaults, Basics requires a name). Scroll: budgets/new/page.tsx <main> dropped min-h-screen (it nested inside the (app) shell's scroll surface and overshot by the header height → permanent scrollbar); content-height now → scroll only on overflow. Verified: tsc clean; Vitest wizard-page + wizard-stepper 20/20 (incl. 'features step carries push switch', 'renders no Skip button', 'no push stepper segment', completion→spendings); i18n 77/77; E2E onboarding.feature @phase8 3/3 LIVE (push opt-in on features step + completes; enable-push-then-complete; 'wizard does not force a scrollbar on a short step at mobile size' measures documentElement.scrollHeight ≤ innerHeight at 390x844). Awaiting user device double-check of the 3 fixes."

### 10. Locale Negotiation (Accept-Language)

expected: Fresh browser (no cookie, signed out) with Polish browser language lands on /pl Polish UI. English browser stays on /en. URL locale prefix and a SAVED locale cookie still win over the Accept-Language header.
result: pass
bug_found_260619: "Verification surfaced a real precedence bug + a test gap. (1) BUG: for signed-out users on a no-prefix path, a saved locale cookie did NOT beat the Accept-Language header. middleware.ts:85 keyed its custom Accept-Language block ONLY on the budget-locale cookie, firing whenever budget-locale was absent — so NEXT_LOCALE=en + Polish browser redirected to /pl (case B), and budget-locale=pl + English browser went to /en (case E). next-intl honors NEXT_LOCALE (which it sets on every localized visit), but our block pre-empted it. (2) TEST GAP: the two 'cookie wins' cases in middleware-accept-language.test.ts were placebos (expect(true).toBe(true)) — they never invoked middleware, which is exactly how cases B/E slipped through."
fix_260619: "TDD. Extracted pure helpers resolveSavedLocale() + decideSignedOutLocaleRedirect() into lib/negotiate-locale.ts enforcing precedence budget-locale > NEXT_LOCALE > Accept-Language > en (the real middleware can't be imported under Vitest — next-intl pulls in next/server — so the decision logic is extracted+tested, same pattern as negotiateLocale). middleware.ts now reads BOTH cookies (budget-locale + NEXT_LOCALE) and delegates; a saved cookie always wins, an explicit saved 'en' redirects to /en so it beats a non-en header, and the no-saved-cookie+header=en case falls through to next-intl (canonical /en, no redundant redirect, no loop). Placebos removed."
claude_verified_260619: "2026-06-19 — RED 14/14 → GREEN. test/middleware-locale-precedence.test.ts (14) + middleware-accept-language.test.ts + locale-switcher.test.tsx = 34/34; tsc clean. Web image rebuilt + restarted healthy; LIVE curl against budget-dev.madonzy.com (redirect:manual) 10/10: fresh AL=pl→/pl, AL=en→/en, AL=uk→/uk; URL prefix /en/sign-in+AL=pl→no redirect; NEXT_LOCALE=en+AL=pl→/en (was /pl); budget-locale=pl+AL=en→/pl (was /en); NEXT_LOCALE=pl+AL=en→/pl; budget-locale=en+AL=pl→/en; budget-locale>NEXT_LOCALE; unsupported cookie 'de' ignored→header. Loop-check: NEXT_LOCALE=en+AL=pl follows to /en/sign-in?reason=required (no loop). Awaiting user spot-check."

### 11. PL/UK Translation Quality — New Strings (I18N-02 — manual)

expected: Switch UI to PL then UK. New strings (install banner, push settings, onboarding push step, offline/sync/server-down messages) read naturally — no machine-translation howlers, no missing keys, no English leakage.
result: pass
user_confirmed: "2026-06-19 — reviewed the 40-string EN/PL/UK doc (i18n-review.md); PL/UK read naturally, no howlers."
claude_verified_260619: "2026-06-19 — mechanical: 810 EN keys, 0 missing in pl/uk (flat deep-key parity); i18n Vitest suite 57/57; no English leakage (every new string differs from EN except offline.badge loanword 'Offline' in PL). Flagged that pwa/offline/sync/serverDown namespaces carry \_machineTranslated:true; push + onboarding not MT-flagged. Naturalness is the native-speaker call → user-confirmed."

### 12. Server-Down Screen → REDESIGNED to cached banner + read-only (like offline)

expected (NEW, 2026-06-19 per user): When the API is unreachable and the user is SIGNED IN (session cookie present), the app no longer bounces to the /server-down card — it shows the cached app with a full-width red banner "Server unavailable — showing cached data" (or "— data updated {relativeTime}") and goes READ-ONLY (every write control blocked + bottom toast), exactly like offline. Navigation + viewing stay live. When the API returns, the banner clears and data refetches automatically (no manual reload). The /server-down card (single Reload, no links) remains ONLY for the no-session-cookie case.
old_expected: With API stopped and signed out, app shows server-down card with single Reload button (no links). Optional/destructive — may skip.
result: pass
design_change_260619: "User watched the /server-down card on a reload-during-outage and asked to make it behave like offline (cached banner + read-only) instead. Built via the brainstorming→spec→plan→execute flow. Approach A: a unified ConnectivityProvider (online|offline|server-down, offline precedence) is the single source of truth; clientApiFetch reports reachability via api-unreachable-bus; the provider confirms server-down with a /api/health probe and PAUSES React Query's onlineManager so queries keep cached data (the key to 'show cached data' — without it, onLine=true makes RQ refetch+error→empty state); recovery polls /api/health (~7s) → online + invalidateQueries. (app)/layout renders the cached degraded shell when ServerUnavailableError + session cookie (trust cookie+RLS, same as offline); no cookie → keeps the /server-down redirect. OfflineStaleBar + OfflineReadOnly consume the provider (server-down wording branch). Spec/plan: docs/superpowers/specs|plans/2026-06-19-server-down-cached-banner*."
claude_verified_260619b: "2026-06-19 — TDD, code-logic untouched elsewhere. New tests: api-unreachable-bus 3, budget-fetch-reachability 4, connectivity-provider 6 (incl. onlineManager pause/resume + 4xx false-positive guard + health-probe confirm), offline-stale-bar-serverdown 3, offline-read-only-serverdown 3, server-down-card 7; i18n parity 57/57 (added serverDown.banner.* en/pl/uk); full web Vitest 805 pass/34 skip/0 fail; tsc clean. LIVE on deployed bundle (controlled docker compose stop api, account uat-walk): cold reload of /budgets/<id>/wallets → NO /server-down redirect; cached wallet sections render; red banner 'Server unavailable — data updated less than a minute ago'; Settings cached + currency combobox tap BLOCKED (stayed collapsed) = read-only; restart api → within ~8s banner cleared + html.is-server-down removed + queries resumed (recovery); offline regression (navigator.onLine=false) → banner shows OFFLINE wording + is-offline set + is-server-down false (precedence correct). Awaiting user device double-check."
card_verified_260619: "2026-06-19 (historical, still valid for the no-cookie path) — server-down-card.test.tsx 7/7 (D-07/T-08-04-02: single button, ZERO <a> links; Retry health-probe→assign(next); cross-origin ?next→/{locale} guard; still-down/fetch-reject inline message; Reload→location.reload). Live /en/server-down renders single 'Try again' button, no links."

### 13. Offline Read-Only Mode + reliable instant cached nav (online & offline)

expected: Offline (airplane mode) the whole app is read-only. Every write control (inputs, checkboxes, radios, selects/comboboxes, toggles, sliders, save/create/submit buttons) is dimmed + blocked; tapping shows a bottom toast "Budget is read-only while you're offline." Navigation + viewing stay live (tabs, month nav, switcher, profile/sign-out, scroll, open-to-view). Reserve edit no longer skeletons. Offline bar renders with pills/content (no jump, "less than a minute ago"). Offline nav reliable (hard-nav, no black, cold-start budget open works). Cache survives reload (all tab data incl members persisted). No skeleton/scaffold flash, no empty-state flash. Online nav instant from cache (RSC prefetched) + background SWR refetch. Quick-entry keeps its own dialog. Online write behavior otherwise unchanged.
result: pass
user_confirmed: "2026-06-18 — confirmed across ~9 iteration rounds: read-only offline (all controls blocked + bottom toast), honest offline write toast, reliable hard-nav offline (no black, cold-start works), all tab data prefetched+persisted (cache survives reload; members included), 200ms delayed skeleton + whole-block reveal-delayed (no scaffold flash), spendings empty-state race fixed, and instant online nav via RSC prefetch + SWR. All deployed to dev + Playwright/network-verified each round."
origin: "Round 1 was per-mutation honest-refusal (clientApiWrite). User then reported 3 issues (reserve→skeleton, bar jump, settings still editable) and asked for a true read-only mode with all fields disabled + a bottom message. Round 2 = global read-only layer; clientApiWrite kept as the lying-true backstop."
claude_verified: "2026-06-17 — see Current Test block. lib/offline-readonly.ts (12 tests) + offline-read-only.tsx capture-block + offline.readOnly toast (EN/PL/UK) + pre-paint html.is-offline marker + reserved bar slot. tsc clean; web Vitest 745 pass. Live offline (settings): combobox/toggle blocked+dimmed, input dimmed, nav/view live, bottom toast (screenshots)."

## Summary

total: 13
passed: 12
issues: 0
pending: 0
skipped: 0
blocked: 0
removed: 1

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

- truth: "A saved locale cookie wins over the Accept-Language header for signed-out users (URL prefix > cookie > header > en)"
  status: resolved
  reason: "Found during Test 10 verification (2026-06-19): NEXT_LOCALE=en + Polish browser redirected to /pl (case B); budget-locale=pl + English browser went to /en (case E). Saved cookie did NOT beat the header."
  severity: minor
  test: 10
  root_cause: "middleware.ts:85 keyed its custom Accept-Language block ONLY on the budget-locale cookie, firing whenever budget-locale was absent and pre-empting next-intl (which honors a different cookie, NEXT_LOCALE). The two 'cookie wins' unit tests were placebos (expect(true).toBe(true)) — never invoked middleware — so the gap was invisible."
  artifacts:
  - path: "apps/web/src/middleware.ts"
    issue: "custom block keyed only on budget-locale; ignored NEXT_LOCALE; redirected to header-negotiated locale over a stale saved cookie"
  - path: "apps/web/test/middleware-accept-language.test.ts"
    issue: "two cookie-precedence tests were placebos (expect(true).toBe(true))"
    missing:
  - "Read NEXT_LOCALE too; enforce budget-locale > NEXT_LOCALE > Accept-Language > en"
  - "Real tests that exercise the precedence decision"
    debug_session: ""
    resolution: "FIXED 2026-06-19 (TDD). Extracted resolveSavedLocale() + decideSignedOutLocaleRedirect() into lib/negotiate-locale.ts; middleware reads both cookies and delegates. New test/middleware-locale-precedence.test.ts 14/14; placebos removed. tsc clean; web rebuilt+restarted; live curl 10/10 incl. fixed B/E + loop-check. See Test 10 fix_260619."

- truth: "Web Vitest suite is green (bun run test)"
  status: resolved
  reason: "Found during Test 10 verification (2026-06-19): full web Vitest had 6 pre-existing failures on the tasks-redesign branch (773 pass / 6 fail), unrelated to Test 10 (proven by stashing the locale fix — still failed)."
  severity: minor
  test: 10
  root_cause: "Stale tests left behind by intentional code changes (not regressions). (a) use-transactions ×3 + use-drafts ×1: asserted refetchOnMount:'always' which was removed today (obs 14380, nav-perf); use-transactions also leaked mockResolvedValueOnce via mockClear, desyncing isError/snake_case. (b) offline-nav-guard ×2: asserted the superseded round-5 'always hard-nav offline' contract; the shipped component is soft-nav + 1200ms watchdog fallback (260618, memory project_offline_nav_softnav_watchdog)."
  artifacts:
  - path: "apps/web/test/hooks/use-transactions.test.tsx"
    issue: "mockClear leaked once-queue; stale refetch-on-mount assertion"
  - path: "apps/web/test/hooks/use-drafts.test.tsx"
    issue: "stale SWR-refetch assertion"
  - path: "apps/web/test/components/offline-nav-guard.test.tsx"
    issue: "asserted superseded always-hard-nav contract"
    debug_session: ""
    resolution: "FIXED 2026-06-19 (tests-only, code logic untouched). mockClear→mockReset; rewrote initialData tests to 'no refetch while fresh (staleTime 30s)'; rewrote offline-nav-guard to the soft-nav+watchdog contract (fake-timer driven, both commit + cold-miss paths). Fixed one stale comment in use-transactions.ts. Full web Vitest now 780 pass / 34 skip / 0 fail."
