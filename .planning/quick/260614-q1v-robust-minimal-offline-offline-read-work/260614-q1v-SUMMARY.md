---
quick_id: 260614-q1v
type: execute
mode: quick
title: Robust-minimal offline — offline READ works, offline WRITE removed
subsystem: web / offline / service-worker
status: complete (device checkpoint pending)
date: 2026-06-14
tags: [offline, pwa, service-worker, i18n, react-query, teardown]
commits:
  - ef7621a feat(q1v): fetch-driven write rollback + honest offline toast
  - e4cf979 refactor(q1v): tear out offline write-queue / sync / pending-marker subsystem
  - a72b12e feat(q1v): SW navigation serves cached page offline; remove stuck offline.html
  - 480ec86 chore(q1v): i18n cleanup of orphaned sync/offline keys + fix dependent tests
  - 3cbfc73 build(q1v): regenerate public/sw.js for new offline navigation strategy
key-files:
  created: []
  deleted:
    - apps/web/src/lib/offline-queue.ts
    - apps/web/src/hooks/use-online-sync.ts
    - apps/web/src/components/common/sync-issues-list.tsx
    - apps/web/src/components/common/offline-debug.tsx
    - apps/web/src/lib/offline-trace.ts
    - apps/web/public/offline.html
    - apps/web/test/offline-queue.test.ts
    - apps/web/test/use-online-sync.test.ts
    - apps/web/test/sync-issues-list.test.tsx
    - apps/web/test/transaction-row-marker.test.tsx
  modified:
    - apps/web/src/hooks/use-create-transaction.ts
    - apps/web/src/components/common/offline-resilience.tsx
    - apps/web/src/components/common/offline-status-badge.tsx
    - apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx
    - apps/web/src/lib/offline-cache.ts
    - apps/web/src/app/[locale]/(app)/layout.tsx
    - apps/web/src/components/auth/profile-menu.tsx
    - apps/web/sw.ts
    - apps/web/sw-offline.ts
    - apps/web/public/sw.js
    - apps/web/messages/{en,pl,uk}.json
    - apps/web/test/offline-write-path.test.tsx
    - apps/web/test/offline-status-badge.test.tsx
    - apps/web/test/offline-shell-wiring.test.ts
    - apps/web/test/offline-cache.test.ts
    - apps/web/test/sw-offline.test.ts
    - apps/web/test/hooks/use-create-transaction.test.tsx
    - apps/web/test/components/spendings-grid/transaction-row.test.tsx
metrics:
  tasks: 4 (+ deploy/verify)
  duration: ~75m
  files_changed: ~30 (10 deleted)
---

# Quick 260614-q1v: Robust-minimal offline Summary

Phase-08 UAT test-4 decision implemented: stopped fighting offline-WRITE sync.
Offline is now READ-only-reliable; offline WRITE rolls back the optimistic row and
shows an honest toast instead of queueing/replaying. The fragile write-queue /
replay / sync-issues / pending-marker / offline.html stack and the temporary
on-device diagnostics are gone. Offline READ (cache + "Last synced" marker),
PWA install/precache, and the SW-update auto-reload island are intact.

## What changed (per task)

**T1 — write path (fetch-result-driven).** `use-create-transaction.ts`: removed
the offline fork (`enqueueOfflineTxn`, `OfflineEnqueuedError`, `fallbackToQueue`,
the `navigator.onLine` fast path, `traceOffline`, the OFFW-3 module-load marker).
The mutation now ALWAYS POSTs with `AbortSignal.timeout(8000)`. Failure
classification: network throw / `AbortError` / `res.status>=500` →
`OfflineWriteError`; 4xx → plain `Error`. `onError` rolls back `ctx.previous` for
`["transactions",budgetId,month]` + invalidates `["spendings-summary",budgetId]`,
then `toast.error(err instanceof OfflineWriteError ? t("write.offline") :
t("write.failed"))`. Optimistic row dropped `pending`/`unsent`/`idempotencyKey`.

**T2 — subsystem teardown.** Deleted offline-queue, use-online-sync,
sync-issues-list + 4 dead tests. `offline-resilience` renders only
`<SwUpdateReloader/>`. `offline-status-badge` is a plain online/offline pill
(`offline.badge.ariaLabel`). `transaction-row` lost the queue lookup,
Clock/Loader2/RotateCcw marker, pending/unsent props + attrs, and `onRetry`.
`offline-cache` drops the `offline-queue` store (`deleteObjectStore` on upgrade)
and bumps `DB_VERSION` 1→2. `(app)/layout` no longer mounts OfflineDebug /
SyncIssuesList.

**T3 — SW navigation = cached page offline.** `sw-offline.ts`: rewrote
`handleNavigationRequest(request, fetchFn, matchCache, makeInlineNotice, 5000)` →
network-first; throw/5xx → return the CACHED nav doc for the route; cache MISS →
`buildInlineOfflineNotice` (minimal self-recovering 503: reload on
online/focus/visibility, localized en/pl/uk, NO `/api/health` gate). Deleted
`OFFLINE_FALLBACK_URL`, `sanitizeNext`, `decideOfflineRecovery`,
`buildOfflineDocument`. `sw.ts` rewired the nav handler with
`caches.match(req,{ignoreSearch:true})`; kept skipWaiting/clientsClaim/
navigationPreload + `/api` NetworkOnly + style SWR + script/image CacheFirst +
activate-purge + notificationclick. Deleted `public/offline.html`.

**T4 — i18n cleanup + dependent tests.** Removed orphaned keys (grep-confirmed
zero refs, en/pl/uk aligned 794 each): `sync.badge`, `sync.row`, `sync.issues`,
`offline.heading`, `offline.body`, `offline.reload`. KEPT `sync.staleness`,
`offline.badge.*`, `offline.unavailable.*`, `server_down.*` (all still
referenced). Added `next-intl`+`sonner` mocks to `use-create-transaction.test`
and replaced the pending/unsent cases in `transaction-row.test` with a no-marker
assertion.

## Deviations from Plan

**1. [Rule 3 - Blocking] Pulled T4's diagnostics deletion forward into T2.**
`offline-debug.tsx` imported the now-deleted `@/lib/offline-queue`, so `tsc` could
not stay green at the end of T2 without removing it. Deleted `offline-debug.tsx` +
`offline-trace.ts` and removed the `toggleOffdbg` wiring from `profile-menu.tsx`
(vpdbg kept) during T2. T4 then covered only the i18n cleanup + full gate. Net
scope unchanged.

**2. [Rule 3 - Blocking] Added next-intl + sonner mocks to existing
use-create-transaction.test.tsx.** The hook now reads `grid.txn.write.*` and
toasts on error; the pre-existing test rendered the hook without an i18n/toast
context, so two onSuccess cases threw. Stubbed both — test intent (mapper +
invalidation) preserved.

**3. [Rule 3 - Blocking] Regenerated tracked public/sw.js.** The Serwist-compiled
SW artifact is checked into git but the Docker build regenerated it only inside
the container; synced the fresh artifact to the host (offline.html removed, inline
notice added) so the tracked copy matches the served code.

## Gates

- `tsc --noEmit`: clean (exit 0).
- `eslint src`: clean for all q1v-modified files (verified file-by-file). 2
  PRE-EXISTING errors remain in UNTOUCHED files (`pill-task-slider.tsx:86`,
  `use-budget-data.ts:121`) — `react-hooks/exhaustive-deps` rule-not-found, a flat-
  config plugin-resolution debt last touched by e82/08-03, already logged in
  `.planning/phases/deferred-items.md` (260614-ipk + q1v). Out of scope.
- `check:i18n`: I18N_GATE_PASS (794 keys aligned en/pl/uk).
- `depcheck` (dependency-cruiser): no violations (1183 modules) — no dangling
  imports after deletions.
- `bun run test` (web Vitest): 689 pass / 2 fail / 43 skip. The 2 failures are
  PRE-EXISTING `shell-safe-area.test.ts` structure assertions (unmodified file,
  last touched by aw9; SHELL-R17/R18 iOS-shell work), explicitly out of scope.
  All offline-area suites pass (offline-write-path 6/6, sw-offline 9/9,
  offline-status-badge/shell-wiring/cache 17/17, transaction-row 17/17,
  use-create-transaction 10/10).
- `make ci-gate`: 51/51 tenant-leak security tests pass (the runner's non-zero
  exit is the documented pre-existing aggregate-coverage-threshold debt, not a
  security failure — see STATE.md Pending Todos).

## Served-bundle verification (Docker, web healthy)

Rebuilt web `--no-cache` + `make restart-web`; web `Up (healthy)`. In the served
container:

- `public/sw.js`: `offline.html`=0, `server-down-card`=0, `decideOfflineRecovery`/
  `__OFFLINE_NEXT`=0, `offline-inline-notice`=1.
- `.next` bundle: "Try again when you reconnect" present; "Sync issues"=0;
  `offdbg`/`OFFDBG`/`offline-trace`=0.
- Source grep `offline-queue|use-online-sync|offline-trace|offline-debug|
offline.html|toggleOffdbg|OfflineEnqueuedError|isOfflinePending|SyncIssuesList`
  over `apps/web/src` + `apps/web/public` → only benign comments + the intentional
  `deleteObjectStore("offline-queue")` migration line.

## Kept intact (must-haves)

openBudgetDB read cache + `setSyncMeta`/`getSyncMeta`, `staleness-marker.tsx`,
`use-budget-data.ts`/`use-cache-on-fetch.ts`, `offline-fallback.tsx`
(`offline.unavailable.*` empty-state), `sw-update-reloader.tsx`, PWA precache,
`/api` NetworkOnly, skipWaiting+clientsClaim.

## Device checkpoint (user)

One-time caveat: because the SW navigation strategy AND `DB_VERSION` (1→2)
changed, the device must **Clear caches + unregister SW once** (Profile →
Diagnostics, or browser site-data), then reopen, before testing. Then verify on
https://budget-dev.madonzy.com (installed iOS PWA): online add-expense; warm
spendings/wallets/reserves online; offline navigate to a visited route → renders
from cache; offline quick-entry → row disappears + honest toast (no pending
marker); reconnect → next nav just works; offline navigate to a never-visited
route → minimal self-recovering inline notice.

## Known Stubs

None.

## Self-Check: PASSED

All 6 deletions confirmed gone (offline-queue, use-online-sync, sync-issues-list,
offline-debug, offline-trace, offline.html). All 5 kept files present
(offline-cache, sw-update-reloader, staleness-marker, offline-fallback,
sw-offline). All 5 commits found in git (ef7621a, e4cf979, a72b12e, 480ec86,
3cbfc73).
