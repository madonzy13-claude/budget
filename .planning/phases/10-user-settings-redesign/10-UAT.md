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

number: 4
name: Security — Password Change + Active Sessions
expected: |
User ▸ Security: "Change password" emails a reset link to your own address
(set on /reset-password, never inline). Active-sessions list shows your
sessions with per-row "Sign out this session" + "Sign out all other devices",
each behind a confirm dialog; confirming revokes.
awaiting: user response (claude-verified: component 3/0, e2e @settings-security 2/0, live)

## Tests

### 1. Cold Start Smoke Test

expected: Stack boots from scratch — all services healthy, migration 0045 applied (preferred_llm_provider / preferred_stt_provider dropped), health endpoint + authenticated /settings load with no error.
result: pass

### 2. Settings Shell — Single Stacked Accordion + Provider Removed

expected: /settings is ONE stacked accordion (NO pills): General (open by default — Display language + Display currency), Profile, Security, Danger Zone. NO Providers/AI/voice tab anywhere. Clicking a section header expands it. [Redesigned from the 2-pill carousel per user request mid-UAT — commit 52f9f48.]
result: pass

### 3. Profile — Change Name + Request Email Change

expected: In User ▸ Profile, editing the account name and saving persists it. Requesting an email change sends a confirmation link to the CURRENT (old) address; a "pending" badge shows until confirmed; after confirming, the new email works for sign-in (email_hash stays in sync).
result: pass [user double-checked: name + full two-step email change; reworked to Better Auth native flow + 3 follow-up fixes (single verify email, fresh settings, numbered notice). commits ab1a0a3/db32943.]

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
passed: 3
issues: 0
pending: 3
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
  commit: ab1a0a3
  verified: "Component: email-changed-page.test.tsx 3/0 (pending/done/signed-out) + profile-section.test.tsx 6/0 (added next/navigation mock + confirm-notice test); identity email-change-hash.test.ts 2/0 (real-PG, recompute intact). Typecheck web+identity clean. e2e @settings-profile 2/0. LIVE (fresh user, full path): inline two-step message shows both addresses → OLD-address click → /email-changed PENDING (still logged in) → NEW-address click → /email-changed DONE → app, profile menu + settings Profile both show the NEW email, verified, no pending badge; DB email_verified=t."

- truth: "The confirm step emails the new address exactly ONCE; the settings form shows the new email immediately after the change (no reload); the confirm-pending notice is a clean numbered card."
  status: fixed
  reason: "User double-check of the two-step flow: (1) TWO 'Verify your email' messages arrived at the new address; (2) after finishing, the settings form still showed the OLD email until a manual reload; (3) the confirm-pending notice was one run-on paragraph."
  severity: major
  test: 3
  root*cause: "(1) sw.ts had navigationPreload:true while the generic nav route ALSO did its own fetch(req) — a /auth/* navigation hit the server TWICE (browser preload + handler fetch). For a side-effectful auth GET that doubled the new-address email + tripped the spurious &error=USER*NOT_FOUND on the duplicate. (2) /settings RSC was cached in the Router Cache (staleTimes.dynamic 120s) from opening it to START the change, so a return visit rendered the stale email. (3) one-paragraph i18n string."
  fix: "(1) sw.ts: dedicated /auth/* navigation route (placed before the generic one) that consumes event.preloadResponse → exactly one network hit, never cached; (2) /email-changed calls router.refresh() on the DONE step → busts the Router Cache so the next /settings refetches; (3) profile-section renders a titled card with a numbered 2-step <ol> (bold addresses via t.rich) + footnote — confirm_pending replaced by confirm_title/step1/step2/note (en/pl/uk)."
  commit: db32943
  verified: "settings vitest 25/0 (t.rich + router.refresh mocks/asserts). Typecheck clean. LIVE with a freshly-activated SW (unregister+clear+reactivate): single confirm-click → EXACTLY 1 verify email to the new address (was 2) AND clean /email-changed URL (no &error=); finish → soft-nav to /settings shows the NEW email with no reload; notice renders as a clean numbered card (screenshot)."

- truth: "Reset-password / change-password actually changes the password (login with the OLD password is rejected, the NEW one works)."
  status: fixed
  reason: "User report: provided a new password, but the password hadn't changed (sign-in kept working with the old one)."
  severity: major
  test: 4
  root_cause: "Better Auth's Drizzle adapter ran on appPool() with NO app.current_user_id GUC (reset is an unauthenticated token flow). identity.accounts has FORCED RLS whose UPDATE policy required that GUC → the password UPDATE matched ZERO rows, a silent no-op that still returned {status:true}."
  fix: "Dedicated betterAuthPool() whose connections carry app.better_auth=on (set at libpq startup via options); accounts/sessions UPDATE+DELETE RLS bypass keyed on that marker. Scoped to Better Auth's own pool so an arbitrary contextless app_role query (e.g. SQLi elsewhere) still cannot write those tables."
  commit: e149c54
  verified: "identity auth-write-rls.test.ts 5/0 (marked-pool write succeeds; contextless appPool write blocked = no fail-open; cross-user blocked). Live: reset → sign-in NEW pw 200 / OLD pw 401."

- truth: "Sign out this session / sign out all other devices actually revoke (the DB session rows are deleted)."
  status: fixed
  reason: "User report: both revoke actions returned success but the device stayed logged in."
  severity: major
  test: 4
  root_cause: "Same root cause as the reset bug — Better Auth's session DELETE ran with no app.current_user_id GUC against FORCED-RLS identity.sessions, matching zero rows."
  fix: "Same betterAuthPool marker fix (sessions_owner_modify/delete bypass on app.better_auth='on')."
  commit: e149c54
  verified: "auth-write-rls.test.ts #2 (marked-pool DELETE on sessions takes effect). Live earlier: list-sessions count drops + psql confirms the revoked row is gone."

- truth: "The delete-wallet dialog shows the wallet's real name, not the literal {name}; category-created toast interpolates the name too."
  status: fixed
  reason: "User report: removing a wallet showed 'Delete wallet {name}?'."
  severity: minor
  root_cause: "ICU MessageFormat: a single quote QUOTES the following braces, so en.json's 'Delete wallet '{name}'?' emitted {name} verbatim (pl/uk used the correct doubled ''). A sweep found the same class in budgeting_categories.categories.toast.created across en/pl/uk."
  fix: "Doubled the quotes (''{name}'') in both keys, all three locales. New real-engine test (next-intl createTranslator over the real message files) guards every quoted-{name} string — the existing wallet-row test mocked next-intl with naive replace and could not catch ICU bugs."
  commit: 2aaf294
  verified: "icu-placeholder-escaping 6/0; served bundle ships the doubled form. Live: dialog reads \"Delete wallet 'My Vacation Fund'?\"."

- truth: "Investments desktop listing (holdings AND groups): no edit pen; columns are qty · P/L% · P/L amount · value · weight; clicking a row opens the edit sheet."
  status: fixed
  reason: "User request: remove the edit pen, move profit before currency, add P/L money amount, add quantity before profit — same for group rows."
  severity: enhancement
  decisions: "User chose: desktop click opens the edit sheet (pen removed); column order qty · P/L% · P/L amt · value · weight (groups: qty blank)."
  fix: "investment-row + investment-group-header desktop clusters reordered + P/L money added; group P/L money now from a real aggregate (groupAggregate.plCents) instead of the ÷0-prone back-derivation; pen removed, matchMedia-gated desktop click → edit; row action area + group spacer aligned to w-7."
  commit: 3961881
  verified: "152 web tests green; tsc clean. Live (desktop): AAPL row = 'AAPL (Apple Inc.) · 10 · +40.0% · +1,200 · USD 4,200 · 68.8%'; row labelled 'Edit …' (click-to-edit, no pen); group header shows +1,100 P/L money."

- truth: "A holding can be dragged OUT of a group even when a single group holds every item (no loose rows)."
  status: fixed
  reason: "User report: with one group and no ungrouped items it was impossible to drag an item out; only worked once a loose item existed."
  severity: major
  root_cause: "Group membership changed only by dropping onto a LOOSE row; with no loose rows there was no 'outside' drop target. Also closestCenter selected by the dragged row's centre, so even a dropzone wasn't reliably hit."
  fix: "Added an ungroup dropzone (UNGROUPED_DROP_ID) shown only while a grouped holding is dragged; resolveDragEnd makes the holding loose when dropped there. Custom collisionDetection prioritises the zone via pointerWithin (fallback closestCenter); MeasuringStrategy.Always so the mid-drag-mounted zone registers. i18n en/pl/uk."
  commit: "3961881, 296dd5e"
  verified: "investment-grouping ungroup branch 3/0. Live (single group, no loose rows): drag AAPL → zone appears → drop → AAPL becomes a top-level loose row and PERSISTS across reload; the group (now just MSFT) remains."

- truth: "The global User Settings page spans the same desktop width (1280px) as the in-budget Settings tab — header logo→profile span."
  status: fixed
  reason: "User request: make global settings desktop width match the BDP settings width."
  severity: enhancement
  fix: "user-settings-shell main max-w-3xl → max-w-[1280px] (the BDP Settings TabPane width); all other wrapper classes already matched."
  commit: be4e78e
  verified: "shell test asserts the 1280 column. Live: at a 1600px viewport the settings content caps at 1280 (not 768), matching the header span."

- truth: "General settings has a searchable Timezone dropdown that saves + persists; a new user's timezone is seeded at registration."
  status: fixed
  reason: "User request: add a timezone dropdown in General; default it from the user's location at registration; review all dates to use the timezone."
  severity: enhancement
  test: 3
  decisions: "Default seeded from the BROWSER timezone at sign-up (Intl.DateTimeFormat().resolvedOptions().timeZone), not IP geolocation — more accurate (device-true), dependency-free, and no extra network call. Flagged for the user to confirm."
  fix: "identity.users.timezone column (migration 0047, nullable → 'UTC' fallback in the repo DTO); Better Auth additionalField timezone (input:true) so sign-up writes it; sign-up-form passes the browser zone; update-timezone application service (IANA-validated) + PUT /settings/timezone route; TimezoneSelect (Popover+Command, searchable, GMT-offset labels) in General; en/pl/uk keys."
  commit: e1800d1
  verified: "identity repo 8/0, settings route 11/0 (401/200/400), web component 40/0; web tsc clean. Live: picker filters to 'Europe/Warsaw GMT+2' → save → DB timezone=Europe/Warsaw → survives reload (hydrates from session). API sign-up with timezone='America/New_York' writes the column end-to-end (better-auth additionalField)."

- truth: "Timestamps (session last-active) render in the user's chosen timezone, localized + 24h."
  status: fixed
  reason: "Part of the timezone request: review ALL dates so they use the timezone."
  severity: enhancement
  test: 4
  fix: "formatTimestamp(value, locale, timeZone) — Intl.DateTimeFormat {day, month:long, year, hour, minute, hour12:false} in the user's IANA zone; security-section reads userTz from the live session. Date-ONLY values (transactions) stay UTC-pinned via the existing formatBudgetDate (calendar-correct, no tz shift) — only true instants get the zone."
  commit: e1800d1
  verified: "format-date 4/0 (Warsaw/UTC/Tokyo-boundary/invalid). Live: with tz=Europe/Warsaw a session whose raw updated_at is 10:37 UTC renders '12:37' (= UTC+2); a 10:38 UTC session renders '12:38'. NOTE: ordering is locale-driven — PL/UK render day-first like the example ('27 czerwca 2026, 12:37'); en-US renders month-first ('June 27, 2026 at 12:37'). Flag for the user if they want day-first forced for EN too."

- truth: "Active-sessions list is mobile-friendly cards: device icon, parsed 'Browser on OS', IP + country flag, localized last-active, per-row revoke + sign-out-others."
  status: fixed
  reason: "User request: make the sessions UX mobile-friendly with human-readable localized dates, a shortened browser/OS, the IP, and a country flag."
  severity: enhancement
  test: 4
  decisions: "Built-in UA parser (no external ua-parser-js dependency) — covers every browser/OS the app's users have; avoids a dep + Docker-install friction. IP→country via best-effort ipwho.is (3s timeout, private-IP guard, graceful no-flag fallback). Flagged for the user."
  fix: "sessions-list rewritten from a Table to a card <ul>; parse-user-agent.ts ({browser,os}); ip-country.ts (flagEmoji + lookupCountry); Monitor/Smartphone icon by OS; testids preserved."
  commit: e1800d1
  verified: "parse-user-agent 8/0, ip-country flag tests, sessions component tests green. Live: two cards — 'Safari on Linux · Current · 🇵🇱 · 195.116.124.47 · June 27, 2026 at 12:38' + a Bun/1.3.12 card with revoke; sign-out-others present. (Real Chrome parses as 'Chrome'; only Playwright's HeadlessChrome UA — no word boundary before 'Chrome' — falls through to Safari, never a real user.)"

- truth: "Settings has a Dark/Light appearance toggle; the choice flips the theme instantly, persists across reloads, and paints with no flash (FOUC)."
  status: fixed
  reason: "User request: add a light/dark mode toggle per DESIGN.md."
  severity: enhancement
  test: 2
  fix: "ThemeToggle radiogroup (Dark/Light) in General; applyTheme sets html[data-theme] + budget-theme cookie + theme-color meta; global.css :root[data-theme=light] redefines only the base -dark tokens (shadcn aliases + @theme follow via var()); a pre-paint inline script in layout.tsx reads the cookie before first paint so there is no FOUC."
  commit: e1800d1
  verified: "theme-toggle component tests green; web tsc clean. Live: click Light → html data-theme=light, body bg #fff, color-scheme:light, cookie budget-theme=light, theme-color #ffffff → reload keeps Light with the pre-paint script present (no flash). Screenshot captured."

- truth: "Light theme has no black gaps: accordion content / task-slider panels flip with the theme; cards read on the white canvas."
  status: fixed
  reason: "User screenshots: in light mode the expanded settings-accordion panels + task-slider were solid black, and #fafafa cards were near-invisible on white."
  severity: major
  fix: "9 call sites hardcoded bg-[#141920] → token-ised --surface-sunken-dark (dark #141920 / light #e7eaef); inset shadow softened 0.45→0.22 (harsh on light); light card #fafafa→#eef1f4 (visible), elevated/hairline tuned for hierarchy."
  commit: 0e15ff7
  verified: "Live (light, phone): panels compute #e7eaef, cards #eef1f4 on both BDP + global settings — no black. Screenshot."

- truth: "Changing the timezone re-renders the session-list timestamps live (no reload)."
  status: fixed
  reason: "User report: changing the timezone didn't update the time shown in the sessions list."
  severity: major
  root_cause: "security-section read the zone once from getSession at mount; SessionsList also COPIED its prop into state once (useState(sessions)) and never synced — so a re-format never reached the DOM. (And getSession's cookie cache is stale right after the PUT.)"
  fix: "timezone-select dispatches window 'budget:timezone-changed' on save; security-section keeps raw rows + a tz state (seeded from the session, updated by the event) and formats via useMemo; SessionsList now derives the visible list from props + a revoked-IDs set (so re-formatted props flow through while revoked rows stay gone)."
  commit: d1202b7
  verified: "vitest security-section-timezone 1/0 (event re-formats UTC→Tokyo) + sessions-list/security 13/0. Live: picking Europe/Warsaw → session times shift to 12:37/12:38 instantly; dispatch America/New_York → 06:37. (Initial live failure was a STALE Serwist SW serving old chunks — unregister+clear caches fixed it.)"

- truth: "The profile mini-menu has an in-place Dark/Light theme toggle and no redundant Profile link."
  status: fixed
  reason: "User request: add a theme toggle to the profile mini-menu (#2) and remove the Profile link (#3, it duplicated Settings)."
  severity: enhancement
  fix: "Removed the Profile NavLink; added a theme menu item (Sun/Moon, shows the target mode) that calls the exported applyTheme from theme-toggle (one source of truth for cookie + data-theme + theme-color); nav.theme_light/theme_dark in en/pl/uk."
  commit: d1202b7
  verified: "profile-menu tests: no profile-menu-profile, theme item flips html data-theme. Live: menu = Settings · Dark mode · Install · Sign out (no Profile); clicking the toggle flips light↔dark in place (cookie + body bg) and relabels."

- truth: "Crypto instrument suggestions don't show a currency on the right (it's noise — crypto has one global quote)."
  status: fixed
  reason: "User request: for the Crypto type, the suggestion dropdown should not show the currency on the right."
  severity: minor
  fix: "instrument-search-input right label drops quoteCurrency when assetClass === 'crypto' (equities/etc still show exchange · currency)."
  commit: d1202b7
  verified: "instrument-search 1/0 (crypto omits currency, equities keep it). Live: searching 'Bitcoin' under Crypto lists symbol + name only — no USD."

- truth: "Grouped (nested) investment rows read as a deeper level: lighter than the group/top-level in light mode (#fafafa), darker in dark mode."
  status: fixed
  reason: "User report (screenshot): in light mode the group's sub-items were not visually distinct/were darker; they should be lighter (#fafafa)."
  severity: minor
  fix: "Nested-row bg token-ised --surface-nested-dark (dark #171b20 = the old color-mix; light #fafafa). Top-level/group stay on the card (#eef1f4), so children read lighter in light + darker in dark."
  commit: d1202b7
  verified: "investment-row tests green. Live (light): nested Microsoft row = #fafafa vs top-level Apple row = #eef1f4. Screenshot."
