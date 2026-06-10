---
phase: 05-reserves-wallets-tabs
plan: 05-18
subsystem: ui / pwa / resilience
tags:
  [
    serwist,
    service-worker,
    offline,
    server-down,
    redirect-loop,
    pwa,
    i18n,
    bugfix,
    TDD,
  ]

# Dependency graph
requires:
  - phase: 05-reserves-wallets-tabs
    provides: server-down RSC redirect + /[locale]/server-down screen + error boundaries (May 31 work)
provides:
  - static-precached-offline-document (/offline.html)
  - sw-navigation-strategy-never-serves-stale-shell
  - offline-redirect-loop-fixed
affects: [pwa, service-worker, offline-ux, any-future-route-added-to-app-shell]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static precached /offline.html as the SW navigation fallback (NOT a dynamic route — those are never precached as HTML)"
    - "Pure, dependency-injected SW logic (sw-offline.ts) unit-tested with fake fetch/cache because Playwright setOffline cannot fail the SW's own fetch"

key-files:
  created:
    - apps/web/public/offline.html
    - apps/web/sw-offline.ts
    - apps/web/test/sw-offline.test.ts
    - apps/web/e2e/server-down.spec.ts
    - apps/web/playwright.specs.config.ts
  modified:
    - apps/web/sw.ts

key-decisions:
  - "Root cause is the SW navigation fallback, not the server-side redirect. The May 31 RSC path (ServerUnavailableError -> /server-down) works; the loop lives in the Serwist NetworkFirst handler."
  - "Offline fallback target moved from the dynamic /<locale>/server-down route to a static /offline.html. @serwist/next only precaches the dynamic route's JS chunk, never a navigable HTML document, so caches.match always MISSED and NetworkFirst served a stale, redirect-prone app/sign-in shell."
  - "The SW navigation handler now NEVER serves a stale cached page shell. On any network failure (reject or 5xx) it returns the static, non-redirecting /offline.html. A single failed dependency yields exactly one offline render and zero redirects."
  - "3xx responses pass through untouched so the existing server-side /server-down redirect is preserved."
  - "SW failure branch is unit-tested (sw-offline.test.ts), not E2E, because Playwright context.setOffline() does not make the service worker's own fetch reject."

patterns-established:
  - "Static self-contained offline doc: inline CSS + inline JS, zero external assets, EN/PL/UK via injected globals, renders with no network and no JS bundle."
  - "SW injects window.__OFFLINE_NEXT / __OFFLINE_LANG into the precached doc (it cannot mutate the doc URL) so Retry returns the user to the originally requested page + locale."

requirements-completed: []

# Metrics
duration: ~70min
completed: 2026-06-06
---

# Phase 5 Plan 18: Offline / Server-Down Redirect-Loop Fix Summary

**When the backend is unreachable the installed PWA now renders a static, DESIGN.md-compliant, EN/PL/UK server-down screen instead of looping through cached redirects — fixed by replacing the dynamic-route SW fallback (never precached as HTML) with a precached /offline.html and a navigation handler that never serves a stale, redirect-prone shell.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 1 investigation + 1 fix (multi-part) + tests
- **Files modified:** 1 modified, 5 created

## Root Cause (WHERE it looped)

The redirect loop did **not** live in the server-side path. The May-31 work already
handles the API-container-down case at the RSC layer: `(app)/layout.tsx` catches
`ServerUnavailableError` from `getServerSession()` and redirects to
`/[locale]/server-down` (verified still working: `/en/server-down` → 200 with the
card).

The loop lives in the **Serwist service worker navigation handler**:

1. `sw.ts` set `OFFLINE_FALLBACK_URL = "/en/server-down"` and relied on
   `caches.match("/en/server-down")` hitting the **precache**.
2. `/[locale]/server-down` is a **dynamic** Next.js route. `@serwist/next` only adds
   the route's **JS chunk** (`.../server-down/page-*.js`) to `__SW_MANIFEST` — never a
   navigable HTML **document**. So `caches.match("/en/server-down")` always **MISSED**
   (confirmed empirically: `DIRECT_CACHE_MATCH_server-down = MISS`).
3. With the fallback unreachable, the `NetworkFirst` "pages" strategy fell back to
   whatever HTML sat in its runtime cache — commonly a previously-visited
   authenticated app shell or `/sign-in`. That **stale shell re-runs its client-side
   auth/locale logic with no live server and bounces sign-in ⇄ home** — the infinite
   offline redirect loop. (Reproduced: offline navigation to `/en/settings` returned
   the cached `/en/sign-in` shell, status 200, never an offline screen.)

A secondary discovery: the SW only installs in a **secure context**. Over the
plain-HTTP Tailscale dev URL `navigator.serviceWorker` is `undefined`, so the SW path
must be tested against `http://localhost:3000` (matches existing memory note).

## The Fix

1. **`apps/web/public/offline.html`** — a static, self-contained server-down document.
   Lives in `public/`, so Serwist's default `globPublicPatterns` precaches it: a HIT is
   **guaranteed** offline (confirmed: `/offline.html` is in the built precache manifest;
   `caches.match("/offline.html")` → `HIT 200`). Inline CSS + inline JS, no external
   assets; DESIGN.md dark canvas (#181a20), single yellow accent (#fcd535), Inter type,
   6px button radius — matching `global-error.tsx` and the in-app `ServerDownCard`.
   EN/PL/UK copy mirrors `messages/*.json → server_down`. The Retry button probes
   `/api/health` and hard-navigates back to the originally requested page; `online`
   auto-retries.

2. **`apps/web/sw.ts` navigation handler** — replaced plain `NetworkFirst` with a
   network-then-offline-doc strategy: try the network (5s timeout); on **any** failure
   (rejected fetch OR 5xx) return the static `/offline.html` (503). It **never** serves a
   stale cached page shell, so a single failed dependency can produce **one** offline
   render and **zero** redirects. 3xx responses pass through untouched so the server-side
   `/server-down` redirect is preserved.

3. **`apps/web/sw-offline.ts`** — extracted the pure navigation + offline-document logic
   so it is unit-testable without booting the service worker. The SW injects
   `window.__OFFLINE_NEXT` / `__OFFLINE_LANG` into the precached doc (it cannot mutate the
   doc URL) so Retry returns the user to the right page + locale; a precache MISS still
   yields a localized inline 503 (never the browser's blank screen).

## Reproduction Test (RED → GREEN)

- **`apps/web/test/sw-offline.test.ts`** (Vitest, 8 tests) — the deterministic guard.
  Drives the pure handler with fake fetch/cache. **RED** first proved the contract; key
  assertions now GREEN:
  - network reject → offline doc (503), `makeOffline` called once;
  - 5xx → offline doc;
  - **success → passthrough** (no offline fallback, no loop);
  - **3xx → passthrough** (server-side `/server-down` redirect preserved);
  - offline fallback **never resolves to a redirect** (status 503, no `location`);
  - precache HIT seeds `__OFFLINE_NEXT`/`__OFFLINE_LANG`; precache MISS → localized inline 503. Chosen over E2E because Playwright `context.setOffline()` does **not** make the
    SW's own `fetch` reject — the genuine failure branch is impossible to force E2E.
- **`apps/web/e2e/server-down.spec.ts`** (`@tasks-redesign`, 2 tests × chromium+mobile = 4,
  all GREEN) — verifies the E2E-observable half against the live stack:
  (A) the SW precaches a **navigable** `/offline.html` that renders the server-down card and
  does **not** redirect (parked on `/offline.html`, < 3 navigations); (B) failing every
  `/auth` + `/api` request at the edge terminates the redirect chain (< 8 navigations — no
  loop). Run via `playwright.specs.config.ts` (the BDD config's `testDir` points at the
  generated dir and ignores raw specs).

## Web Rebuild Confirmation

- `docker compose build web` (sw.ts → sw.js) + `make restart-web` (Infisical-wrapped).
- `docker compose ps web` → **healthy**.
- `/offline.html` → 200 with `server-down-card`; `sw.js` precaches `/offline.html` and
  carries the navigate handler; `/en/server-down` (server-side route) still → 200 (no
  regression).
- Regression check: a previously-"failing" reserves `@tasks-redesign` scenario passes when
  run via Infisical (`DATABASE_URL_APP` present) — the 12 failures in the ad-hoc run were a
  missing-env fixture issue, not a navigation regression.

## Observations (screenshots)

Captured `/offline.html` in EN/PL/UK + mobile (390px) and the still-unreachable retry state:

- **EN/desktop + mobile:** dark canvas, yellow server-crash badge in a translucent yellow
  disc, "We can't reach the server" heading, muted body copy, yellow "Try again" pill with
  spinning refresh glyph. Mobile wraps cleanly, card centered.
- **PL retry state:** "Spróbuj ponownie" CTA + red "Serwer wciąż nie odpowiada. Daj mu
  jeszcze chwilę." after a blocked retry.
- **UK:** "Не вдається з'єднатися із сервером" + "Спробувати ще раз".

All match DESIGN.md (single yellow accent, dark canvas, Inter, red destructive only for the
error line) and reuse the existing ServerDownCard visual language — no new primitives.

## Deviations from Plan

This was a debug task (no pre-written PLAN.md). No architectural changes (Rule 4 not
triggered). One scope-justified addition beyond the literal ask:

- **`apps/web/sw-offline.ts` extraction + `playwright.specs.config.ts`** (Rule 3 — enable
  testability): the SW bootstrap (`new Serwist()` + `addEventListeners()`) crashes under
  happy-dom, and the BDD playwright config ignores raw specs. Extracting pure logic +
  adding a raw-spec config were required to land a deterministic test for the fix.

## Self-Check: PASSED
