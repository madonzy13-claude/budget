---
slug: mobile-server-down-screen
status: resolved
trigger: |
  Mobile shows black screen or infinite redirect when Docker (API) down. Need friendly localized "server unavailable" screen with reload button instead.
created: 2026-05-31
updated: 2026-05-31
resolved_commits:
  - a8c445f fix(web): friendly server-down screen instead of black screen / sign-in loop on api outage
  - 35b6a6b feat(web): friendly localized 404 pages with brand header and home button
verification:
  - 18/18 Playwright BDD scenarios pass on the live stack (chromium + mobile viewports)
  - Curl smoke: api down + cookie -> 307 /[locale]/server-down; api up -> normal flow; Retry navigates to ?next path after health probe
  - Localized in EN / PL / UK for both server_down and not_found namespaces
---

# Debug Session: mobile-server-down-screen

## Symptoms

DATA_START

- expected: When API/backend (Docker) is unreachable, mobile users see a friendly localized "server unavailable" screen with a Retry/Reload button.
- actual: Sometimes mobile shows a black screen; sometimes the page goes into an infinite redirect loop.
- error_messages: Caught silently inside server-session.ts; surfaced only via console.error in `[server-session] fetch error`.
- timeline: Reproducible whenever Docker stack is down (API container off / unreachable).
- reproduction: `docker compose stop api`, then load PWA on mobile — try `/`, `/sign-in`, `/budgets`, `/budgets/<id>/spendings`.
- scope: All surfaces — signed-in app shell, auth pages (sign-in/up), root landing.
- priority: Fix root cause for both (black screen + infinite redirect) with one unified offline/server-down screen.
- reload_ux: Retry button pings `/api/health`; if OK reload page, if still down stay on error screen with a "still unreachable" toast.
  DATA_END

## Current Focus

- hypothesis: CONFIRMED — two distinct failure modes:
  - **"Infinite redirect" perception:** `apps/web/src/lib/server-session.ts:92-95` swallows ALL errors (network, parse, etc.) and returns `null`. `apps/web/src/app/[locale]/(app)/layout.tsx:44-51` interprets `null` as "session expired" → redirects to `/sign-in?reason=session_expired`. Middleware strips the cookie. User lands on `/sign-in`. Tries to sign in → API still down → `authClient.signIn` fails with a generic form error. User retries, navigates back to `/`, same loop. From the user's point of view: "I keep getting bounced to sign-in and can't get back in."
  - **"Black screen" on PWA:** When the layout itself throws (e.g. Better Auth client crash inside a nested layout, or `[locale]/layout.tsx` next-intl `getMessages()` rejecting), the segment-level `(app)/error.tsx` does NOT catch it — layout throws bubble to root → `global-error.tsx` renders. In PWA standalone mode with `--canvas-dark: #181a20`, the user sees the global-error background BEFORE React mounts; in the worst case the global-error JS bundle has not yet hydrated → blank dark viewport = "black screen".
  - **Service worker amplifier:** `apps/web/sw.ts` has no navigation fallback registered. NetworkFirst 5s-timeout navigation that times out + cache miss = browser-native offline page (sometimes blank on iOS standalone PWAs).
- next_action: Implement unified `/server-down` route + wire all three failure paths into it.
- test: After fix — stop `api`, hit `/`, `/sign-in`, `/budgets`, `/budgets/<id>/spendings` in mobile viewport. Expect single localized "Server unavailable" screen with Retry. No black screen. No redirect to sign-in.

## Evidence

- timestamp: 2026-05-31 08:21 UTC — `apps/web/src/lib/server-session.ts:92-95` catches network errors with `return null` → indistinguishable from "no session"
- timestamp: 2026-05-31 08:21 UTC — `apps/web/src/app/[locale]/(app)/layout.tsx:44-51` treats `null` session as "expired" → redirects to `/sign-in?reason=session_expired`
- timestamp: 2026-05-31 08:21 UTC — `apps/web/src/app/[locale]/(app)/error.tsx` only catches errors INSIDE the layout subtree — throws in the layout file itself bubble UP to `global-error.tsx`
- timestamp: 2026-05-31 08:21 UTC — `apps/web/src/app/global-error.tsx` is hardcoded English; renders on `#181a20` dark canvas. If JS hasn't hydrated yet (slow mobile) viewport is pure dark = "black screen"
- timestamp: 2026-05-31 08:21 UTC — `apps/web/sw.ts` has no offline navigation fallback registered; NetworkFirst timeout + cache miss → browser default offline behavior
- timestamp: 2026-05-31 08:21 UTC — `apps/web/src/middleware.ts:73-75` redirects authenticated users away from `/sign-in` to `/` — when cookie is stale-but-present + API down, contributes to back-and-forth perception
- timestamp: 2026-05-31 08:21 UTC — `apps/api/src/app.ts:50` exposes `GET /health` returning `{ok:true,region}` — suitable for Retry probe

## Eliminated

- hypothesis: Middleware itself contains a redirect loop. **No** — middleware doesn't call the API; it only inspects cookies. The cookie-strip on `?reason=session_expired` (line 45-49) prevents the obvious loop.

## Resolution

- root_cause: server-session.ts conflates network failure with absent session → layout treats both as "redirect to /sign-in"; no dedicated server-down route; no Serwist offline fallback; layout throws bubble to hardcoded-English global-error which appears as black screen on mobile PWA.
- fix:
  1. Add a `ServerUnavailableError` sentinel in `server-session.ts` — thrown (not returned) on network failure / 5xx so callers can distinguish.
  2. Add `/[locale]/server-down/page.tsx` — static RSC, no server fetches, localized copy, mounts client `<ServerDownCard>` with Retry button.
  3. `<ServerDownCard>` retries by GETting `/api/health`; on success `window.location.reload()`, on failure sonner toast "still unreachable".
  4. Update `(app)/layout.tsx` — wrap `getServerSession()` in try/catch, on `ServerUnavailableError` `redirect('/${locale}/server-down')`. The onboarding-guard fetch block already catches errors silently — leave as-is (graceful degrade).
  5. Add `[locale]/layout.tsx` `error.tsx` adjacent — catches throws above `(app)` segment, redirects to /server-down too (avoids global-error fallback).
  6. Update `middleware.ts` — add `/server-down` to a `PUBLIC_PATHS` allowlist so it bypasses auth-route logic + protected-route logic.
  7. Update `sw.ts` — register `/en/server-down` as a navigation fallback when NetworkFirst times out AND cache misses.
  8. Add i18n keys `server_down.{title,body,retry,still_unreachable}` to en.json, pl.json, uk.json.
  9. Add Playwright BDD scenario in `apps/web/tests/e2e/features/server-down.feature` stopping the API container then asserting the server-down screen renders with Retry button.
- verification: `make restart-web`; `docker compose stop api`; iPhone viewport via Playwright/DevTools → load `/`, `/en/sign-in`, `/en/budgets`, `/en/budgets/<id>/spendings` → assert server-down screen + Retry button. `docker compose start api`; tap Retry → page reloads to original destination.
- files_changed:
  - apps/web/src/lib/server-session.ts (modified)
  - apps/web/src/app/[locale]/(app)/layout.tsx (modified)
  - apps/web/src/app/[locale]/server-down/page.tsx (new)
  - apps/web/src/components/common/server-down-card.tsx (new)
  - apps/web/src/app/[locale]/error.tsx (new)
  - apps/web/src/middleware.ts (modified)
  - apps/web/sw.ts (modified)
  - apps/web/messages/{en,pl,uk}.json (modified)
  - apps/web/tests/e2e/features/server-down.feature (new)
  - apps/web/tests/e2e/page-objects/ServerDownPage.ts (new)
