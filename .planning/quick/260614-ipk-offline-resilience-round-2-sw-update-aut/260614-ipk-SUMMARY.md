---
quick_id: 260614-ipk
type: quick
title: Offline resilience round 2 — SW-update auto-reload + reconnect replay + offline.html recovery
status: awaiting-device-uat
subsystem: pwa-offline
tags: [pwa, offline, service-worker, ios, react-query, idempotency]
key-files:
  created:
    - apps/web/src/components/common/sw-update-reloader.tsx
    - apps/web/src/components/common/offline-resilience.tsx
    - apps/web/test/sw-update-reloader.test.tsx
  modified:
    - apps/web/src/hooks/use-online-sync.ts
    - apps/web/test/use-online-sync.test.ts
    - apps/web/src/app/[locale]/(app)/layout.tsx
    - apps/web/sw-offline.ts
    - apps/web/public/offline.html
    - apps/web/test/sw-offline.test.ts
decisions:
  - controllerchange reloader is hand-rolled (NOT @serwist/window) — @serwist/next already registers the SW; second registration risks double-registration
  - silent reload (not toast) — app state is server/queue-backed so a reload-on-update loses no data
  - offline.html navigate-anyway: probe is a fast-path hint, never a hard gate (network-first via SW renders the real page if origin is back)
metrics:
  tasks: 3 code tasks + 1 device checkpoint
  duration: ~15m
  completed: 2026-06-14
---

# Quick 260614-ipk: Offline resilience round 2 Summary

SW-update auto-reloader (reload-once on controllerchange, never on first install,
sessionStorage loop-guard) + mounted/hardened `useOnlineSync` (replay on
online/visibilitychange→visible/focus, in-flight re-entrancy guard, idempotent)

- robust `offline.html` Try-again (probe retries+backoff, navigate-anyway on
  probe failure, visibility/focus reprobe) — all Vitest-guaranteed. Closes Phase 08
  UAT test 4 robustly on iOS.

## What changed

### T1 — SW-update auto-reload client island (issue 1)

- New `sw-update-reloader.tsx` (`"use client"`, renders null): a single
  `useEffect` registers a hand-rolled `navigator.serviceWorker`
  `controllerchange` listener.
- Captures `hadController = !!navigator.serviceWorker.controller` at mount; only
  reloads when a controller already existed (UPDATE), never on the null→SW first
  install. sessionStorage `sw-reloaded-once` guard makes a single controllerchange
  yield exactly one reload and survives the post-reload re-mount.
- SSR-safe (null `serviceWorker` guard); cleanup removes the listener.
- 6 Vitest cases: update→reload-once, first-install→no-reload, no-loop (×2),
  SSR no-throw, cleanup.

### T2 — mount + harden useOnlineSync (issue 2)

- `useOnlineSync` was **dead code** (zero mounts). Now mounted via a new
  `offline-resilience.tsx` island that calls `useOnlineSync()` and renders
  `<SwUpdateReloader/>`, placed once in `(app)/layout.tsx` next to
  `<OfflineStatusBadge/>` (inside the app-wide `QueryProvider` from
  `[locale]/layout.tsx`).
- Replay now fires on `online` + `visibilitychange→visible` + window `focus`
  (iOS reports `online` unreliably). A `useRef` in-flight re-entrancy guard
  prevents two concurrent passes from both POSTing the same queued item.
- All four replay branches (2xx/4xx/5xx/throw + failReason skip) and the stored-
  idempotencyKey re-use are **unchanged** — the dedupe contract is preserved.
- 9 Vitest cases: 5 existing branches + A (visibility replays), B (focus
  replays), C (online+visibility double-trigger → exactly one POST, same key),
  D (hidden → no replay).

### T3 — robust offline.html Try-again (issue 3)

- Added pure `decideOfflineRecovery()` + `sanitizeNext()` to `sw-offline.ts`
  (offline.html can't be imported, so the pure decision is unit-tested and the
  inline copy mirrors it).
- New behavior: probe `/api/health` up to 3× with short backoff (~1s, ~2s);
  navigate the moment a probe succeeds, and **navigate anyway** if every probe
  fails — the real navigation goes network-first through the SW and renders the
  real page if the origin is back. The old strict `res.ok` gate (which stranded
  users on a flaky/blocked health probe) is removed.
- `offline.html` mirrors this inline (dependency-free), adds
  `visibilitychange→visible` + `focus` reprobe triggers, keeps the `retrying`
  re-entrancy flag, and preserves `safeNext()`/`sanitizeNext()` open-redirect
  protection verbatim.
- 12 Vitest cases: 8 existing + probe-ok→navigate, probe-fails-but-origin-back→
  still-navigate, retries-with-backoff, sanitizeNext sanitization.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] use-online-sync Test C flaked under the full parallel suite**

- **Found during:** T4 full-suite run (passed in isolation, failed in full run).
- **Issue:** the test file rendered hooks via `renderHook` but never unmounted
  them; a leaked prior-test hook (with its OWN in-flight ref) fired a second
  concurrent replay and broke the exact call-count assertion in the double-
  trigger test. A prior test's `visibilityState="hidden"` could also bleed in.
- **Fix:** `afterEach(cleanup)` to unmount every rendered hook (removing its
  online/visibility/focus listeners) + reset `document.visibilityState` to
  "visible" in `beforeEach`.
- **Files modified:** apps/web/test/use-online-sync.test.ts
- **Commit:** test-cleanup commit (4th).

## Deferred Issues (out of scope)

Logged to `.planning/phases/deferred-items.md`:

- `shell-safe-area.test.ts` — 2 failing (BDP `layout.tsx` structure assertions,
  byte-identical before/after this task; belongs to in-progress iOS shell
  rounds). Confirmed pre-existing.
- `next build` ESLint gate `react-hooks/exhaustive-deps` rule-not-found in
  `pill-task-slider.tsx` / `use-budget-data.ts` (untouched files; config debt).
  `next build` compiles successfully and `tsc --noEmit` is clean (exit 0), so the
  island mount type-checks fine.

## Verification (mechanical — done before the device checkpoint)

- `bun run test -- sw-update-reloader use-online-sync sw-offline offline-write-path offline-queue offline-status-badge transaction-row-marker` → all green.
- Full `bun run test`: 720 passed / 43 skipped; the only 2 failures are the
  pre-existing shell-safe-area structure tests (deferred).
- `tsc --noEmit -p tsconfig.json` → exit 0 (island mount type-clean).
- `docker compose build web` (production image) → built; `make restart-web` →
  `budget-web-1` healthy.
- Served-bundle proof:
  - `/offline.html` (local + live cloudflare origin) carries the new
    `recover()/nextAttempt()` retry logic.
  - `/sw.js` still has `skipWaiting` + `clientsClaim`.
  - `controllerchange` + `visibilitychange` present in the served
    `(app)/layout-*.js` chunk (OfflineResilience island shipped).

## CRITICAL — one force-close required (device note)

The OLD installed PWA on the device does **not** contain the reloader yet (the
reloader is not in the running build). So THIS deploy still will not auto-reload
on the device — the user must **force-close the PWA once** to load the build that
contains the reloader. From then on, every future deploy auto-reloads
(controllerchange → reload-once, no force-close). This is the expected behavior,
not a bug.

## Idempotency safety

Replay re-uses each queue item's STORED `idempotencyKey` (the same key stamped at
enqueue). The new in-flight re-entrancy guard prevents two concurrent replay
passes from both POSTing the same item, and the server dedupes on Idempotency-Key
(T-08-03-02) as a backstop. An online+focus (or online+visibility) double-trigger
therefore cannot double-write. The offline.html recovery is a navigation, not a
write — no double-write risk.

## Self-Check: PASSED

All created/modified files present on disk; all 3 feature commits (fd33304,
53503b1, 079cb7a) + the test-cleanup commit (7bc6bfa) present in git log.
