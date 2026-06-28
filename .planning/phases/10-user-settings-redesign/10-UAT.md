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

- truth: "Tapping anywhere on an investment group line expands/collapses it (no name resize)."
  status: fixed
  reason: "User: clicking the group line made the name bigger (metrics tap) instead of toggling the group."
  severity: minor
  fix: "Folded the chevron into a single body toggle (role=button) calling onToggle; removed the metricsOpen name-size swap + mobile metrics reveal. Whole line toggles."
  commit: 0db7604
  verified: "group-header body-toggle test. Live: clicking 'Tech' name collapsed it (MSFT hidden), name stayed 16px."

- truth: "Logged-out pages have a dark/light switcher in the header (default cookie, else dark)."
  status: fixed
  reason: "User request: add a theme switcher when not logged in."
  severity: enhancement
  fix: "HeaderThemeToggle (applyTheme, no DB persist — no session) on sign-in + sign-up headers and the AuthCardShell (forgot/reset)."
  commit: 0db7604
  verified: "Live: reset-password header toggle flips light→dark (body #0b0e11, cookie=dark)."

- truth: "The profile mini-menu lists the theme toggle ABOVE Settings."
  status: fixed
  reason: "User request: place light/dark above settings."
  severity: trivial
  fix: "Reordered profile-menu items: theme, then Settings."
  commit: 0db7604
  verified: "profile-menu test order [theme, settings, install, sign-out]. Live confirmed."

- truth: "The selected theme is saved to the account so it follows the user across devices/browsers."
  status: fixed
  reason: "User request: persist theme in DB; use it on other devices."
  severity: major
  fix: "users.theme column (migration 0048) + better-auth additionalField + PUT /settings/theme + repo.updateTheme; client persistTheme() on every toggle (settings + mini-menu); (app) layout injects a pre-paint script that seeds data-theme + cookie from the account theme ONLY when the cookie is absent (new device) — mirrors LocaleCookieSync so a stale-session theme never clobbers a live local choice."
  commit: 0db7604
  verified: "api settings theme 3/0 (401/200/400); identity/api/web tsc clean. Live: toggle → DB theme=dark then light; clear the cookie (new-device sim) → reload applied LIGHT from DB (not the dark default) + re-seeded the cookie."

- truth: "The set-new-password field has a show/hide (eye) toggle; the 'Request a new link' link is gone from the form."
  status: fixed
  reason: "User request: add an eye icon to reveal the typed password; remove the 'Request a new link' link."
  severity: minor
  fix: "reset-password: eye button toggles input type password/text; removed the under-form forgot-password link (the expired-token branch keeps its link — the only way out there). password.show/hide i18n in en/pl/uk."
  commit: 0db7604
  verified: "reset eye-toggle test. Live: eye flips type to text; 0 'Request a new link' in the form branch."

- truth: "The settings loading skeleton spans the same 1280px width as the real shell."
  status: fixed
  reason: "User: settings width is correct but the waiting skeleton is still narrow."
  severity: trivial
  fix: "settings loading.tsx max-w-3xl → max-w-[1280px]."
  commit: 0db7604
  verified: "Code + tsc; the live shell already caps at 1280 (the skeleton now matches)."

- truth: "The 'Build <id>' footer is gone from settings."
  status: fixed
  reason: "User request: remove the build info."
  severity: trivial
  fix: "Removed the BuildStamp footer + its getTranslations import from the settings page."
  commit: 0db7604
  verified: "Live: no 'Build' text on /settings."

- truth: "The pill count badge numeral is optically centered in its circle and the circle aligns with the pill icon/label."
  status: fixed
  reason: "User: 'numeral isn't centered, it's even worse now, use playwright to check' — the earlier top-px nudge over-corrected."
  severity: trivial
  fix: "Reverted the top-px nudge (flex-centering a no-descender digit is already correct — pixel-decode: ink center 90.5 == circle center 90.5). Separately fixed the circle sitting ~1px below the icon/label by adding inline-flex items-center to the badge wrapper in bdp-tabs (it was inheriting line-height leading)."
  commit: 3ce9108
  verified: "Pillow pixel-decode of REAL badges (injected tasks): numeral centered; bdp-tab badge vs icon cy delta 0."

- truth: "The investment group header name is normal weight (not bold)."
  status: fixed
  reason: "User: 'why did you make the group label bold? there's no need for that'."
  severity: trivial
  fix: "Group name span text-title-sm (600) → text-body-md (normal), matching the holding rows."
  commit: 3ce9108
  verified: "Vitest investment-group-header 9/9; live DOM weight normal."

- truth: "The logged-out header theme switcher is a plain button, not a filled circle."
  status: fixed
  reason: "User: 'I don't like that the logged-out theme switcher is in a circle'."
  severity: trivial
  fix: "HeaderThemeToggle rounded-full + surface-card bg → rounded-md + bg-transparent (hairline border only)."
  commit: 3ce9108
  verified: "Live: square-ish bordered icon button, no filled circle."

- truth: "Investments drag-and-drop: dragging a group shows a drop gap; a group can move to last; loose items dragged above a top group stay loose; cross-group moves don't throw."
  status: fixed
  reason: "User UAT #4-8: (#4) no drop affordance when dragging a group; (#5/#7) a top group swallows items dragged above/up into it; (#6) a group can't become the last entry; (#8) moving an item between groups throws an error mid-drag."
  severity: major
  fix: "Root cause: group children rendered in a separate nested <div> subtree and group headers were draggable-but-not-sortable. Unified into ONE flat SortableContext — headers AND holdings are sortable items in a single container; grouped children keep the indented look via a per-row ::before rail (no nested subtree). Cross-group moves are now a plain reorder in the same parent (no remount → no #8 crash). resolveDragEnd gains rect-midpoint direction opts: placeAfter (group dragged below its anchor lands after it, #6) and asLoose (holding dragged above a group header stays loose, #5/#7). Both live-move in onDragOver so the block follows and the drop lands in place (#4 gap)."
  commit: d381568
  verified: "22 unit tests in investment-grouping.test.ts (placeAfter + asLoose + existing). Live Playwright pointer-drags (error-instrumented): cross-group drag → errors []; group drag → mid-drag layout snapshot shows siblings open a gap + the block (header+children) relocates as a unit; loose rows dragged near a group stay loose, never swallowed."

- truth: "Investments DnD refinements: a group drags as one cohesive block; group name aligns with holding names; loose rows reliably land above a leading / below a trailing group; pill numeral centered."
  status: fixed
  reason: "User follow-up: (#1) dragging a group moved only the header, children stayed put; (#2) group arrow→text padding didn't match other rows; (#3) a normal item couldn't move above a top group (it joined it) + a stray empty rail showed on the dragged row; (#4) couldn't drop an item below a trailing group in one move; pill numeral looked left-of-center."
  severity: major
  fix: "(#1) DragOverlay lifts the whole block (header + children) following the pointer while the real block dims; groups now commit on DROP (not live-moved) — live-moving a group + MeasuringStrategy.Always re-measured every reorder → re-fired onDragOver → never converged → React #185 max-update-depth crash (the 'Something went wrong' boundary). (#2) group chevron box w-6 → w-4 so the name starts at the holding-name x. (#3/#4) explicit loose drop zones: a top zone (first entry is a group) and bottom zone (last entry is a group / remove-from-group) give reliable boundary targets; new resolveDragEnd LOOSE_TOP_DROP_ID + loose-at-end semantics + looseZone i18n (en/pl/uk); the dragged row's nested rail is suppressed in flight (no stray empty space). Badge: tabular-nums + symmetric padding."
  commit: b0d6b58
  verified: "26 grouping unit tests + 72 across touched component tests. Live Playwright: held group drag → 2 Tech headers (overlay + dimmed original) + 3 dimmed block rows, no #185, errors []; top zone drops a loose row above the leading group; bottom zone (appears when last entry is a group) drops a loose row below the trailing group; pixel-decode badge ink center == circle center (+0.07px); group name left == loose-holding name left (84px)."

- truth: "Investments DnD redesign: no drop zones — placement is position-based; a 2-item group's items swap to first/last; the drag ring hugs the row card; the dropped row no longer flicks back to its origin."
  status: fixed
  reason: "User follow-up (screenshot): (#1) in a 2-item group, dragging the 2nd item UP to first position did nothing (only down worked); (#2) the blue drag ring extended left of the group's inner rail; (#3) on drop the item disappeared for a frame then reappeared; (#4) the dashed 'drop here to keep it separate' zones are unintuitive + the list shrank mid-drag making it look droppable outside the group when it wasn't — wants position-based placement, no extra zones."
  severity: major
  fix: "Deleted both dashed drop zones AND the entire onDragOver live-move machinery (dndHoldings/dragSnapshot/withPersistentGroups/baseEntries). The flat single SortableContext lets @dnd-kit animate every reorder natively, so nothing shrinks mid-drag (#4) and the React #185 crash class is gone (no mid-drag setState). Group is inferred purely on drop from the over target + rect EDGES: asLoose = released above a header's TOP edge (loose above/between groups + ungroup-via-top); asLooseEnd = released below the last row's BOTTOM edge (loose at end / ungroup, replaces the UNGROUPED zone). Edge thresholds (not midpoints) keep drop-onto-first/last-member a normal in-group reorder → #1 fixed. #2: the ring (rounded+shadow+ring-1) moved from the outer sortable wrapper (which carries ml-3 pl-3 + the ::before rail) to the inner card div, so it hugs the row. #3: setCommitted(applyResult(...)) on drop renders the final order on the pointer-up frame (the reorder mutation's optimistic update lands a tick late after await cancelQueries), cleared by an effect when holdings catches up. collisionDetection → closestCenter."
  commit: 94503cf
  verified: "tsc + eslint clean; 21 grouping unit tests rewritten (asLooseEnd) + 94 investments tests green. Live Playwright (fixed-delta / drag-to-absolute-Y pointer drags, DB-verified group_name after each): #1 Nvidia→first in 2-item Tech (both stay Tech); join-via-header (Tesla→Tech, group_name=Tech); loose-above-top (Gold above Tech top → loose sort 0, Metals dissolved); asLooseEnd (Nvidia below last → loose at end); group block drag (Tech moves to end as a unit, stays grouped); zonesDuringDrag=false in every case; console errors []. #2 ring left=48px = card (12px right of rail at 36px) + screenshot. #3 committed-order logic in place (synthetic dispatch can't measure sub-frame React flush — user to confirm visual on device)."

- truth: "Investments DnD: a single 2-item group's items can be ejected to loose (up OR down); a loose item can be placed above/below a group without joining; mobile group-header tap shows the sum-up again."
  status: fixed
  reason: "User retest of the redesign: (bug1) with ONLY a 2-item group, an item couldn't be moved out in either direction; (bug2) with a group + one loose item, the loose item always landed INSIDE the group when dropped above/below it. Plus a regression report: on MOBILE, tapping a group row should show its total sum-up (it does on desktop = collapse/expand), not toggle children."
  severity: major
  fix: "Root cause: the edge-threshold model (header-top / last-bottom) put the only loose-adjacent target on an unreachable sliver, so every near-group drop joined. Replaced the holding resolver with a GEOMETRY children-span model — new pure resolveHoldingDrop(holdings, activeId, insertIndex, targetGroup); the section snapshots each row's rect+group at drag-START (dragGeomRef) and on drop computes insertIndex (rows above the dragged centre) + targetGroup (the group whose VISIBLE-CHILDREN span — member rows top→bottom, excluding the dragged row — contains the centre, else null). So dropping on a member row joins/reorders that group; dropping on the header band / a gap / below the last child lands loose. resolveDragEnd is now only the group-block resolver. Mobile sum-up: matchMedia splits the header body click — desktop toggles children, mobile reveals a sm:hidden sum-up line (P/L% + money + portfolio%); the chevron became a real button (own click + stopPropagation) so mobile can still collapse/expand."
  commit: 85233d2
  verified: "tsc + eslint clean; 28 grouping unit tests (7 new resolveHoldingDrop) + 2 new mobile sum-up tests → 103 investments tests green. Live Playwright on 390px (DB-verified group_name after each): bug1 single Solo(MSFT,NVDA) — eject MSFT DOWN→loose, eject NVDA UP→loose, reorder NVDA→first (both stay Solo); bug2 Solo+Tesla — Tesla onto header band→loose sort 0 (NOT joined), Tesla onto MSFT member row→joins Solo; mobile — body tap reveals sum-up '+9.3% +400 Share:100.0%' without collapsing, chevron collapses 3→0; fresh-load console errors [] across multiple drags (no #185)."

- truth: "Investments DnD: reordering works against a COLLAPSED group (no jump-back); a loose item dropped into a group joins it; within-group reorder is deterministic (no retries); the dragged row's indent previews its target level live; the mobile group sum-up matches the holding-row format minus quantity."
  status: fixed
  reason: "User retest (5 issues): (#1) the mobile group sum-up was cramped/duplicated, not formatted like a holding row; (#2) with one group + one loose item AND the group COLLAPSED, dropping reverted to the previous position (worked only when expanded); (#3) a loose item ABOVE a group dragged INTO it as the first item jumped back (below→first worked); (#4) within-group reorder was intermittent, needing several attempts; (#5) the dragged row showed no indentation until drop (and a leaving row kept its indent until drop)."
  severity: major
  fix: "Holding placement now derives POSITION from @dnd-kit's `over` (arrayMove of the visible sortable ids, then collapsed headers expanded back to their members in computeInsertIndex) instead of a geometry row-count — so the commit equals the previewed gap (no jump-back, #2/#3), works against a collapsed group whose members aren't rendered, and is deterministic (#4). GROUP is still the children-span (computeTargetGroup over the drag-START snapshot, now incl. collapsed-group header bands). #5: onDragOver tracks the dragged centre's live target group into a `dragActive` state; rowNested(id) feeds it to the row's `nested` prop so the ::before rail + ml-3 indent adapt to the level it will drop into (guarded setState only on group change → no #185 re-measure loop). #1: the sum-up mirrors the holding-row mobile-expanded block — line 1 P/L% + P/L money (left) ↔ budget-ccy + amount (right), line 2 Share% — and the always-shown main amount is `hidden sm:flex` when the sum-up is open so it isn't duplicated."
  commit: b3e8d4e
  verified: "tsc exit 0; 103 investments vitest green (incl. 11 header). Live Playwright on 390px (DB-verified group_name+sort_order after each): #2 Solo collapsed + Tesla — Tesla up→loose sort 0 above group, Tesla down→loose below group (both commit, no jump-back); #3 Tesla loose-above expanded Solo dragged in → joins Solo (the jump-back-to-loose is gone; exact slot follows dnd's down-onto-target=after convention + live pointer); #4 Nvidia↔Microsoft within Tech reordered 2/2 first-try (both stay Tech); #1 screenshot shows '+5.7% +200 … USD 3,700 / Share: 29.6%' with the duplicate main amount hidden (one visible '3,700'). #5 wiring + logic verified and reuses the same snapshot as the verified drop path, BUT the synthetic-pointer harness can't exercise the live indent (the active sortable's transform stays identity under document-dispatched events — `active.rect.translated` never enters the band mid-drag), so the live indent needs a real-device eyeball. Console: only pre-existing React #418 hydration mismatch, no #185."

- truth: "Investments DnD: no toast on sort; the live indent now updates DURING the drag (delta-driven); dragging a group no longer leaves a broken/overlapping remnant in place."
  status: fixed
  reason: "User retest (4 issues): (#1) reordering showed an 'Investments updated' toast — sort should be silent; (#2) requested a drop-line so the user knows exactly where it will land; (#3 — screenshot) dragging an EXPANDED group left its header+children as a dimmed, overlapping remnant in the old position (fine after drop); (#4) an item dragged from outside INTO a group still showed no indentation until drop (the previous delta-less onDragOver fix never fired on-device)."
  severity: major
  fix: "#1: useUpdateHolding gained a `silent` flag; the drag-triggered group reassignment passes silent:true so the 'saved' toast is suppressed (the edit-sheet save still toasts). #4 (root cause of the never-firing indent): the live target group is now computed from `activeStartMid + dnd-kit delta.y` in onDragMove (every move) instead of `active.rect.translated` (which lagged / never advanced) — and the DROP uses the SAME basis, so preview and commit always agree. #3: the in-place block of the group being dragged is now opacity-0 (was opacity-40) on BOTH the header and its children — the children are separate sortables that slid independently of the header, so a dimmed block split into an overlapping remnant; the cohesive copy already lives in the DragOverlay. #2 (drop-line): deferred — it overlaps the now-working live indent + the gap @dnd-kit opens, and a pixel-accurate line needs per-move DOM measurement (re-measure/#185 risk); offered to add it if still wanted after seeing #4."
  commit: 7290081
  verified: "tsc exit 0; 103 investments vitest green. Live Playwright 390px (DB-verified): #1 Tesla→Tech group change committed with 0 toasts ([data-sonner-toast] empty); #4 MutationObserver on the dragged row's class — indent toggled false→true entering the Tech band and true→false leaving to loose (was never-true before), and the drop matched the preview (Tesla joined Tech sort 0); #3 mid group-drag the original Tech header + both members computed opacity '0' with exactly 1 DragOverlay block (was 0.4 + overlap); group-block drag still commits (Metals→top, membership intact); console 0 errors, no #185."

- truth: "Investments DnD: the group sum-up name matches a tapped row's name size; an item from above can be dropped as the FIRST child of a group; a collapsed group joins when the item is BELOW the header (indent) and goes loose only once dragged ABOVE it."
  status: fixed
  reason: "User retest (3 issues): (#1) the group name looked bigger than the other items when tapped; (#2) with 1 group + a normal item above it, dragging the item into the open group could only place it 2nd/3rd, never 1st (from below→1st worked); (#3) for a COLLAPSED group, dragging an item up showed the item ABOVE the group WITH indent (child) then removed indent further up — inverted; it should show the item BELOW the group WITH indent (child) and only jump ABOVE without indent (loose) when dragged past it."
  severity: major
  fix: "ROOT of #2+#3: the group's join band started at the first member's top (expanded) / the header's top (collapsed), so the only 'first-child' / 'child' anchor sat ABOVE where @dnd-kit swaps the dragged row across the header. Moved the join band's TOP edge to the header's CENTRE (snapshotDragGeometry now snapshots header rects + member bottoms; span = [headerCentre, lastMemberBottom|headerBottom]). The list strategy swaps the row above the header exactly at the header centre, so now the indent is ON only while the row sits BELOW the header (child) and clears the instant it crosses ABOVE (loose) — #3 — and the header's lower half is a reachable FIRST-child zone from above (over=header → insertIndex 0) — #2. #1: the group header name shrinks to text-num-sm when the sum-up is open (mirrors a holding row's name, which already shrinks on tap); showSum is only ever true on mobile so desktop keeps text-body-md."
  commit: 48c5cf5
  verified: "tsc clean; 103 investments vitest green. Live Playwright 390px (DB-verified group_name+sort_order, MutationObserver on the dragged row's class): #2 Tesla from above dropped in Tech's header lower-half → Tesla sort 0 (FIRST child); #3 collapsed Tech + Tesla below — per-step sampling: indent ON while Tesla below the header (teslaTop≥650, pointer below centre) and OFF once above (teslaTop≤638, pointer above centre), flipping exactly at headerCentre; drop above centre → loose sort 0, drop below centre → joins Tech (preview==commit both ways); #1 group name computed 14px/text-num-sm when sum-up open (== a tapped row's name). Regressions clean: eject MSFT down→loose (Nvidia stays Tech); group-block drag commits; console 0 errors, no #185. Deferred from prior round: #2-drop-line still not built (offered)."

- truth: "Investments DnD: a COLLAPSED group shows the dragged item BELOW the header with indent (child) and only drops the indent once the item is dragged ABOVE the header (loose)."
  status: fixed
  reason: "User retest: #3 (collapsed) still 'jumps above the group header' — the item never shows a below-header-with-indent phase. (My prior 48c5cf5 'verification' was invalid: localStorage had persisted the group EXPANDED, so I tested the expanded case, not collapsed.)"
  severity: major
  fix: "For a collapsed group the join band was only [headerCentre, headerBottom] — a ~28px sliver sitting ON the header, so during the upward drag the item showed no indent through its whole below-header travel and only flickered indent right as it swapped above (read as 'jumps above'). Extended the COLLAPSED group's band a full row BELOW the header (bottom = headerBottom + 64; expanded groups still use lastMemberBottom). Now the item's centre is inside the band throughout its below-header travel → indent ON while below, and it clears the instant the item crosses above the header centre (where the list strategy swaps it above) → loose."
  commit: 2f7bb98
  verified: "tsc clean; 103 vitest green. Live Playwright 390px with the group VERIFIED collapsed (aria-expanded=false this time): per-step MutationObserver — Tesla (loose, below collapsed Tech) dragged UP: indent ON while Tesla sits at its origin BELOW the header (teslaTop 693) and through the travel, flips OFF exactly when Tesla rises above the header (teslaTop 629); drop while below+indent → JOINS Tech (child), drop while above → loose sort 0. (Known gap: dragging from ABOVE a collapsed group straight DOWN onto it lands loose-below rather than joining — not the reported 'bottom→top' flow; noted for a follow-up.)"
