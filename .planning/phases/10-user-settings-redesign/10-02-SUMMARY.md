---
phase: 10-user-settings-redesign
plan: 02
subsystem: ui
tags: [next, app-router, carousel, pushstate, accordion, next-intl, settings]

requires:
  - phase: 10-user-settings-redesign
    provides: provider-free identity (10-01) so the legacy Providers tab has no backend
  - phase: 03-bdp
    provides: client pushState carousel pattern (budget-detail.tsx, bdp-tabs.ts, loading.tsx)
provides:
  - "2-pill client settings carousel (General · User) replacing the legacy 4-tab page"
  - "User-pill accordion shell with Profile/Security/Danger slots for plans 10-03/04/06"
  - "Restructured settings.* i18n tree (providers removed; pills/general/user/section keys added en/pl/uk)"
affects: [10-03, 10-04, 10-06]

tech-stack:
  added: []
  patterns:
    - "lib/settings-tabs.ts: non-client shared consts so the server catch-all page can call isSettingsTab (parallel to lib/bdp-tabs.ts)"
    - "Catch-all [[...tab]] route + per-route loading.tsx + pass-through layout = instant soft-nav; pill switch is pushState-only (no RSC)"
    - "Section slots: thin placeholder components at the exact paths plans 10-03/04/06 overwrite"

key-files:
  created:
    - apps/web/src/lib/settings-tabs.ts
    - apps/web/src/app/[locale]/(app)/settings/[[...tab]]/page.tsx
    - apps/web/src/app/[locale]/(app)/settings/[[...tab]]/loading.tsx
    - apps/web/src/app/[locale]/(app)/settings/layout.tsx
    - apps/web/src/components/settings/user-settings-shell.tsx
    - apps/web/src/components/settings/general-pill.tsx
    - apps/web/src/components/settings/user-pill.tsx
    - apps/web/src/components/settings/profile-section.tsx
    - apps/web/src/components/settings/security-section.tsx
    - apps/web/src/components/settings/account-danger-zone.tsx
    - apps/web/test/settings/user-settings-shell.test.tsx
  modified:
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json

key-decisions:
  - "Section titles live under settings.user.sections.* (clean) — NOT settings.sections.*/settings.danger.* which are already owned by the BDP per-budget settings accordion"
  - "Danger-zone leaf keys reserved under settings.accountDanger.* for 10-06 (settings.danger.* is BDP-owned)"
  - "Lighter than BDP: 2 pills, inline pill bar, no task slider / no tiered prefetch (General reads session, User mounts client components)"
  - "Deployment: dropping the provider columns (10-01) requires the api+worker containers to be redeployed too — the running api still had the old better-auth additionalFields and 500'd sign-up until rebuilt"

patterns-established:
  - "User-settings carousel mirrors the BDP pushState carousel pattern"

requirements-completed: [USET-01, USET-02, USET-03]

duration: 55min
completed: 2026-06-26
---

# Phase 10 Plan 02: 2-Pill Settings Carousel Shell Summary

**Legacy 4-tab user-settings page replaced by a 2-pill (General · User) client pushState carousel with a Profile/Security/Danger accordion shell, mirroring the BDP catch-all-route pattern; settings.\* i18n restructured across en/pl/uk.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-06-26T14:26:00Z
- **Completed:** 2026-06-26T14:48:00Z
- **Tasks:** shell consts, route swap, components, i18n, test
- **Files modified:** 14 (11 created, 3 i18n edited, 1 page deleted)

## Accomplishments

- `lib/settings-tabs.ts` shared consts + `isSettingsTab` type guard (non-client, server-callable)
- Catch-all `[[...tab]]/page.tsx` (validate pill, fresh session read, render shell) + `loading.tsx` skeleton + pass-through `layout.tsx`; deleted the old `settings/page.tsx`
- `user-settings-shell.tsx`: client pushState carousel with a sliding yellow active pill + popstate sync
- `general-pill.tsx`: reuses LocaleSelect + DisplayCurrencyPicker verbatim (no backend change)
- `user-pill.tsx`: Profile/Security/Danger accordion (default-open Profile), section bodies are placeholder slots overwritten by 10-03/04/06
- i18n: removed `settings.providers.*`; added `settings.pills.*`, `settings.general/user.*`, `settings.user.sections.*`, and placeholder leaf keys — all translated in PL + UK

## Task Commits

1. **Settings carousel shell + General + User accordion + i18n** - `f718d85` (feat)

(Plus the 10-01 api/worker redeploy, see Deviations — committed as part of confirming the live render, no source change beyond what 10-01 already committed.)

## Files Created/Modified

- `apps/web/src/lib/settings-tabs.ts` - SETTINGS_TAB_ORDER + isSettingsTab
- `apps/web/src/app/[locale]/(app)/settings/[[...tab]]/page.tsx` - server: validate pill, fresh session, render shell + build stamp
- `apps/web/src/app/[locale]/(app)/settings/[[...tab]]/loading.tsx` - instant soft-nav skeleton
- `apps/web/src/app/[locale]/(app)/settings/layout.tsx` - pass-through
- `apps/web/src/components/settings/user-settings-shell.tsx` - pushState carousel
- `apps/web/src/components/settings/general-pill.tsx` - language + currency
- `apps/web/src/components/settings/user-pill.tsx` - Profile/Security/Danger accordion
- `apps/web/src/components/settings/{profile-section,security-section,account-danger-zone}.tsx` - placeholder slots
- `apps/web/test/settings/user-settings-shell.test.tsx` - component test (3 cases)
- `apps/web/messages/{en,pl,uk}.json` - settings.\* restructure

## Decisions Made

- **i18n namespacing avoids BDP collisions:** `settings.sections.*` and `settings.danger.*` are already owned by the BDP per-budget settings accordion. The new USER section titles go under `settings.user.sections.*`, and the user danger-zone leaves are reserved under `settings.accountDanger.*` (for 10-06). This diverges from the plan's literal "reserve `settings.danger.*`" wording, which would have clobbered BDP keys.
- **Build-freshness footer preserved** (a server sub-component) so on-device freshness still shows under the new shell.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Redeployed api + worker after the 10-01 column drop**

- **Found during:** live Playwright verification (sign-up to reach the authenticated /settings)
- **Issue:** sign-up 500'd with `column "preferred_llm_provider" does not exist`. 10-01 dropped the columns in the DB and rebuilt the migrator, but the RUNNING api+worker containers still had the old `better-auth.ts` whose user-create INSERT referenced the dropped columns. The dev stack was left half-migrated (DB new, app old).
- **Fix:** `docker compose build api worker && make restart-api && make restart-worker`. Sign-up then succeeded.
- **Files modified:** none (redeploy of already-committed 10-01 code)
- **Verification:** fresh sign-up → email verify (mailpit) → authenticated session; no 500.
- **Committed in:** n/a (container redeploy; the source was already in 10-01's commits)

---

**Total deviations:** 1 (1 blocking redeploy).
**Impact on plan:** Necessary to make 10-01's change actually live + to verify 10-02. Surfaces a deploy-ordering note for the phase: an identity schema/column change requires rebuilding api+worker, not just the migrator.

## Verification Results

- Component test `user-settings-shell.test.tsx` → **3 pass / 0 fail** (both pills render, User-pill click swaps to the accordion + calls history.pushState, deep-link to User renders the accordion first)
- `docker compose build web` (production `next build`) → **Compiled successfully**, TypeScript clean, route `ƒ /[locale]/settings/[[...tab]]` built — NO RSC server/client boundary error
- i18n parity: en/pl/uk settings-subtree key sets are **identical**; `grep settings.providers apps/web/messages` exits 1
- **Live (budget-dev.madonzy.com, authenticated):** /en/settings renders the General pane (Display language + Display currency); clicking **User** pushes the URL to `/en/settings/user` with NO full reload (same page tree, build stamp persists) and renders the **Profile / Security / Danger Zone** accordion (Profile open → placeholder). Screenshot: phase10-settings-user.png.

## Issues Encountered

- **Headless-browser session loop:** the Playwright browser carried a stale/expired httpOnly session cookie; middleware bounced `/sign-up` → `/` → `/sign-in?reason=session_expired` (the in-middleware `cookies.delete` did not clear the `__Secure-` cookie). Cleared by POSTing `/api/auth/sign-out`, then signed up a fresh user + verified via mailpit. Not related to this plan's code.

## Next Phase Readiness

- The shell + accordion slots are ready. Plans 10-03 (Profile), 10-04 (Security), 10-06 (Danger Zone) overwrite `profile-section.tsx` / `security-section.tsx` / `account-danger-zone.tsx` with their real bodies and add their leaf i18n keys (`settings.profile.*`, `settings.security.*`, `settings.accountDanger.*`).

---

_Phase: 10-user-settings-redesign_
_Completed: 2026-06-26_
