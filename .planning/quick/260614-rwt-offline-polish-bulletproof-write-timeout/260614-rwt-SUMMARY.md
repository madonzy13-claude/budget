---
phase: quick-260614-rwt
plan: 01
subsystem: pwa-offline
tags: [offline, pwa, service-worker, ios, i18n, settings]
requires:
  - "260614-q1v robust-minimal offline (no queue, optimistic rollback, network-first nav)"
provides:
  - "Bulletproof offline write timeout (Promise.race) + navigator.onLine fast-negative"
  - "App-shell offline nav: NetworkFirst-with-write nav cache + precached static header shell"
  - "Header inline offline pill (zero-height, no layout shift)"
  - "Settings build/version stamp (NEXT_PUBLIC_BUILD_ID)"
affects:
  - apps/web/src/hooks/use-create-transaction.ts
  - apps/web/sw.ts
  - apps/web/sw-offline.ts
  - apps/web/public/offline-shell.html
  - apps/web/src/components/common/offline-status-badge.tsx
  - apps/web/src/components/budgeting/top-nav.tsx
tech-stack:
  patterns:
    - "Manual Promise.race timeout (iOS WebKit ignores AbortSignal on a hung POST)"
    - "NetworkFirst-WITH-WRITE nav cache (cache.put successful 2xx navigations)"
    - "Hand-authored static app-shell HTML precached via @serwist/next public/** glob"
key-files:
  created:
    - apps/web/public/offline-shell.html
  modified:
    - apps/web/src/hooks/use-create-transaction.ts
    - apps/web/test/offline-write-path.test.tsx
    - apps/web/sw.ts
    - apps/web/sw-offline.ts
    - apps/web/test/sw-offline.test.ts
    - apps/web/test/offline-shell-wiring.test.ts
    - apps/web/src/components/common/offline-status-badge.tsx
    - apps/web/src/components/budgeting/top-nav.tsx
    - apps/web/src/app/[locale]/(app)/layout.tsx
    - apps/web/src/app/[locale]/(app)/settings/page.tsx
    - apps/web/next.config.mjs
    - apps/web/test/offline-status-badge.test.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
decisions:
  - "Explicit `const serwist: Serwist` annotation breaks the TS7022 self-ref cycle introduced by calling serwist.matchPrecache inside the runtimeCaching handler closure"
  - "offline-shell.html is EN base copy + a tiny inline pathname-locale swap for pl/uk; localized VISITED routes are covered by the per-route cached real document"
  - "NEXT_PUBLIC_BUILD_ID inlined via next.config env: explicit CI id → short git SHA → build timestamp; footer falls back to literal 'dev'"
metrics:
  duration: ~25m
  completed: 2026-06-14
---

# Quick 260614-rwt: Offline Polish — Bulletproof Write Timeout, App-Shell Nav, Header Indicator Summary

Three device-confirmed offline refinements on top of 260614-q1v: a bulletproof
offline-write timeout (`Promise.race` + `navigator.onLine` fast-negative) so a hung
iOS POST honestly rolls back within ~6s; an app-shell offline nav that caches real
navigation documents and serves a precached header-chrome shell instead of a bare
full-page takeover; and a zero-height inline header offline pill, plus a Settings
build/version stamp for on-device freshness checks.

## What was built (per task)

### Task 1 — Bulletproof write timeout + onLine fast-negative

- `use-create-transaction.ts`: added `if (navigator.onLine === false) throw new OfflineWriteError()`
  fast-negative at the top of `mutationFn` (onLine===false is reliable on iOS; only `true` lies).
- Wrapped the POST in `Promise.race([fetchPromise, rejectAfter(6000)])` — a manual setTimeout
  that rejects `OfflineWriteError`. iOS WebKit does NOT abort a hung POST via `AbortSignal`,
  so the fetch promise can never settle; the race (6000ms < the kept 8000ms `AbortSignal`)
  guarantees `onError` fires → rollback (`ctx.previous`) + offline toast within ~6s.
- Timer cleared in `finally` so a fast success/failure doesn't leak it.
- The existing `onError` rollback + toast was already correct; the only bug was it never ran.
- Commit: see `feat(quick-260614-rwt-01)`.

### Task 2 — App-shell offline nav

- `sw-offline.ts`: `handleNavigationRequest` is now NetworkFirst-WITH-WRITE. A successful
  real navigation (2xx) is `cachePut` to the nav cache for offline replay; 3xx/4xx pass
  through UNCACHED (auth redirects + 404s stay correct). On unreachable (throw / 5xx):
  cache HIT → cached real doc (header + chrome); cache MISS → precached app-shell; shell
  MISS → minimal last-resort 503.
- `public/offline-shell.html` (NEW): hand-authored static shell — 64px header, 1280px
  max-width, 16px gutter, bold uppercase yellow BUDGET wordmark, global.css tokens, header
  on top + an in-app "wasn't preloaded" note (NOT a centered full-viewport hero). EN base
  copy + tiny inline pl/uk pathname swap. Self-recovery JS (online/focus/visibilitychange →
  `location.reload()`) + Try-again button.
- `sw.ts`: added `NAV_CACHE = "nav-docs-v1"` (kept by the activate purge), wired `cachePut`
  (`caches.open(NAV_CACHE).put`) + `matchShell` (`caches.match("/offline-shell.html")` →
  `serwist.matchPrecache`); deleted `buildInlineOfflineNotice` import + the bare full-page
  takeover. `/api` NetworkOnly denylist + skipWaiting/clientsClaim/navigationPreload kept.
- Commit: see `feat(quick-260614-rwt-02)`.

### Task 3 — Header offline pill + Settings build stamp

- `offline-status-badge.tsx`: redesigned the OFFLINE state as a small `inline-flex` pill
  (animate-pulse dot + "Offline" label), `--destructive` token; online stays `sr-only` →
  zero vertical height, no layout shift. Mounted in the TopNav header right cluster; removed
  from the layout body.
- `offline.badge.label` added (en/pl/uk).
- Settings footer: muted `NEXT_PUBLIC_BUILD_ID` build stamp; `next.config.mjs` inlines
  `BUILD_ID` (CI id → short SHA → build timestamp); `settings.build.label` added (en/pl/uk).
- SwUpdateReloader island confirmed still mounted via OfflineResilience (no code change).
- Commit: see `feat(quick-260614-rwt-03)`.

## TDD

RED-first per task (Vitest, NOT E2E — Playwright setOffline cannot reach the SW):

- T1: hung never-settling POST rolls back within the race window (fake timers) + onLine===false
  short-circuits before the POST. Both RED on the old AbortSignal-only code, GREEN after.
- T2: network-ok caches the nav doc; visited→cached real doc; unvisited→app-shell (header
  present, no bare takeover); redirects/4xx pass through uncached; shell self-recovery;
  shell-MISS last-resort 503; offline-shell.html static-doc assertions.
- T3: offline render is a zero-height inline pill (no banner / no h-\* row); online sr-only;
  badge mounted in TopNav (not layout body).

## Verification (mechanical, done before device confirm)

- `bun run test` touched suites: offline-write-path, sw-offline, offline-status-badge,
  offline-shell-wiring — 30/30 green.
- Full web `bun run test`: 698 pass / 2 fail / 43 skip. The 2 fails are the pre-existing
  `shell-safe-area.test.ts` BDP tab-band / pb-shell-safe failures (last touched by
  260613-aw9 / 260612-t6s) — NOT in this task's scope.
- `tsc --noEmit` clean; `eslint` clean on all changed files; `depcruise` clean
  (1183 modules, 0 violations); `check:i18n` → I18N_GATE_PASS.
- `make ci-gate`: 51 pass / 0 fail (tenant-leak security tests all green; /api NetworkOnly
  denylist intact). The exit-1 is the documented pre-existing coverage-threshold failure
  (~51% aggregate vs 80%), unaffected by this task.
- Rebuilt web + `make restart-web`; web healthy (fresh restart). Served `public/sw.js`
  references `/offline-shell.html` (precache entry + NAV_CACHE set) and `nav-docs-v1`;
  `buildInlineOfflineNotice` removed (0 matches); `startsWith("/api/")` denylist present;
  `offline-shell.html` on disk in the container with all chrome/recovery markers;
  SwUpdateReloader (`controllerchange` + `sw-reloaded-once`) present in the built bundle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TS7022 self-referential inference on `serwist`**

- **Found during:** Task 2 (typecheck).
- **Issue:** Calling `serwist.matchPrecache(...)` inside the `runtimeCaching` handler closure
  made `serwist` reference its own initializer → TS7022/7023/7024.
- **Fix:** Annotated `const serwist: Serwist = new Serwist({...})` to break the inference cycle.
  The handler only runs at request time, after assignment, so runtime behavior is unchanged.
- **Files modified:** apps/web/sw.ts
- **Commit:** `feat(quick-260614-rwt-02)`.

**2. [Rule 3 - Blocking] RED test optimistic-row assertion under fake timers**

- **Found during:** Task 1.
- **Issue:** Under `vi.useFakeTimers()`, the synchronous assert right after `mutate` ran
  before `onMutate` (async — awaits `cancelQueries`) flushed, so the optimistic row count
  hadn't updated yet.
- **Fix:** Added an `await vi.advanceTimersByTimeAsync(0)` to flush `onMutate` before asserting.
- **Files modified:** apps/web/test/offline-write-path.test.tsx
- **Commit:** `feat(quick-260614-rwt-01)`.

## Deferred / Out of scope

- 2 pre-existing `shell-safe-area.test.ts` failures (BDP tab band / pb-shell-safe wrapper) —
  not this task's files; left untouched per scope boundary.
- `make ci-gate` coverage-threshold exit-1 — pre-existing (documented in STATE.md); all 51
  security tests pass.

## Known Stubs

None.

## Device confirmation (Task 4 — checkpoint, awaiting user)

A one-time Clear-site-data + unregister SW on the installed iOS PWA is required (SW nav
strategy changed again). Then confirm: (a) offline add rolls back + toast within ~6s
(instant when iOS knows it's offline); (b) offline reload of a VISITED tab renders the real
page; (c) offline nav to an UNVISITED tab shows the app header + in-app "wasn't preloaded"
note (not a bare screen), Try-again works on reconnect; (d) header shows a small Offline pill
offline / nothing online, no content jump; (e) Settings footer shows a build/version string.
Canonical URL: https://budget-dev.madonzy.com.
