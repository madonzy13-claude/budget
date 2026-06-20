---
task: 260614-kfw
title: On-device offline diagnostics overlay
type: quick
subsystem: web / PWA offline
commit: faa9883
build_id: OFFDBG-1
status: complete
---

# 260614-kfw: On-Device Offline Diagnostics Overlay Summary

Read-only, screenshot-able diagnostics overlay gated behind `?offdbg=1` (or
localStorage `offdbg=1`, so it survives PWA navigation) to get ground truth on
why offline write + recovery fail on the installed iOS PWA. Two prior fixes
passed Vitest but failed on device; this overlay shows what the device actually
runs. No offline logic changed — instrumentation + two service-worker buttons.

## What was built

- **`apps/web/src/components/common/offline-debug.tsx`** (new) — `OfflineDebug`
  client component (`"use client"`, SSR-safe; all `navigator`/`window`/`caches`
  access guarded). Mirrors `viewport-debug.tsx` gating/mount/update pattern.
  Distinct overlay: fixed **bottom-left**, `z-[9998]` (vpdbg is top-left
  `z-[9999]`), monospace, emerald, scrollable (`max-h-[45vh]`, `w-[220px]`) —
  coexists with vpdbg.
- **`apps/web/src/app/[locale]/(app)/layout.tsx`** — mounted `<OfflineDebug />`
  next to `<ViewportDebug />` inside the existing client-island region, so it
  renders app-wide (including the spendings page where the offline add happens).

## Fields the overlay shows (live)

| Field                                       | Source                              | Why                                                                     |
| ------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `OFFDBG-1` (BUILD_ID)                       | hardcoded constant                  | PRIMARY signal — proves device runs the NEW build; old id = stale cache |
| `onLine`                                    | `navigator.onLine`                  | iOS-unreliable signal at heart of the bug (green/red)                   |
| `mode`                                      | `matchMedia(display-mode)`          | standalone vs browser context                                           |
| `queue`                                     | `getOfflineQueue().length`          | did an offline "add" actually ENQUEUE?                                  |
| `failed`                                    | queue items with `failReason`       | how many moved to sync-issues                                           |
| sw `ctrl`                                   | `serviceWorker.controller` present? | is the page SW-controlled (green/red)                                   |
| sw `active`                                 | active registration worker `.state` | activated / installing / redundant                                      |
| sw `ctrlUrl`                                | `controller.scriptURL`              | which SW script controls the page                                       |
| sw `actUrl`                                 | `reg.active.scriptURL`              | which SW is the active worker                                           |
| sw `waiting` / `installing`                 | `reg.waiting` / `reg.installing`    | is a new SW staged but not in control                                   |
| sw `scope`                                  | `reg.scope`                         | registration scope                                                      |
| events `online`/`offline`/`visible`/`focus` | counters since mount                | proves whether iOS actually FIRES these (the replay triggers)           |

Queue is live: subscribes to `OFFLINE_QUEUE_CHANGED_EVENT` and re-reads. A
1500ms poll also catches `navigator.onLine` flips that fire no event on iOS and
SW state transitions that aren't hooked.

**Last replay:** skipped — `use-online-sync.ts` exposes no replay event/state to
subscribe to cheaply (per task's "best-effort; skip if not cheaply available").
The online/focus/visibility event counters already cover the "did a replay
trigger fire" signal.

## Buttons

- **Force update + reload** — `await serviceWorker.getRegistration()?.update()`
  then `location.reload()` (best-effort; reloads regardless).
- **Clear caches + unregister SW** — confirm-guarded; `caches.keys() → delete
all`, `getRegistrations() → unregister all`, then reload. Destructive to the
  offline cache only (server data intact). Diagnoses stale-cache bugs and gives
  the user a recovery path.

## How to enable

Append `?offdbg=1` to any in-app URL, e.g.
`https://budget-dev.madonzy.com/en/budgets/<id>?offdbg=1`. The query param also
sets nothing persistent on its own; to persist across PWA navigation set
localStorage `offdbg` to `1` (the overlay reads both). Independent of vpdbg —
both can be on at once.

## Verification

- `cd apps/web && bunx tsc --noEmit` → exit 0 (full project clean).
- `eslint` on both touched files → clean (linter also auto-formatted import/
  multiline; cosmetic, committed).
- `docker compose build --no-cache web` → built; `make restart-web` → web
  `Up (healthy)`.
- Served client bundle confirmed: HTTP `GET /_next/static/chunks/app/[locale]/
(app)/layout-16471b1a6124b155.js` contains `OFFDBG-1`. The same chunk also
  contains the `offdbg=1` gating, the `offline-debug` testid, and the
  `offdbg-force-update` button testid — so a real browser receives the new
  overlay with gating intact.

## Deviations from Plan

None — executed as written. "Last replay" intentionally skipped per the task's
best-effort clause (no cheap sync-state hook exists).

## Self-Check: PASSED

- FOUND: apps/web/src/components/common/offline-debug.tsx
- FOUND: layout.tsx mount (`<OfflineDebug />`)
- FOUND: commit faa9883
- FOUND: OFFDBG-1 in HTTP-served client chunk

---

## Continuation: Write-Path Telemetry (commit 908d70b, BUILD_ID OFFDBG-2)

Pure instrumentation to pinpoint why the offline write queue stays at 0 on the
iOS PWA. Ground truth going in: device runs new code (OFFDBG-1), `navigator.onLine`
lies (true while offline; offline event lags), and the queue stays 0 even when
onLine is false — so `enqueueOfflineTxn` either hangs or throws on iOS WebKit
IndexedDB. The trace makes the exact failing call visible. NO offline LOGIC change.

### What changed

- **New `apps/web/src/lib/offline-trace.ts`** (no `"use client"`, SSR-safe):
  `traceOffline(step, detail?)` appends `{t: HH:MM:SS.mmm, step, detail}` to a
  ~12-entry ring buffer in **localStorage** key `offline-trace` (localStorage,
  NOT IndexedDB — IDB is the suspect). All ops wrapped in try/catch so tracing
  never throws or alters control flow. Plus `getOfflineTrace()` / `clearOfflineTrace()`.
- **Instrumented `use-create-transaction.ts` mutationFn** — trace lines only, no
  logic change. Named the POST catch param `(e)` to capture the error name.
- **Instrumented `offline-queue.ts` `enqueueOfflineTxn`** — wrapped body in
  try/catch that traces openDB → put-start → put-ok on success, traces
  `enqueue:ERROR` with `name: message` on failure, then **re-throws** (preserves
  the caller's existing error contract — onError path still keeps the optimistic row).
- **offline-debug.tsx overlay** — BUILD_ID `OFFDBG-1` → `OFFDBG-2`; new `[trace]`
  section rendering the last 8 entries (newest first), refreshed on the existing
  1500ms poll; new `Clear trace` button (`offdbg-clear-trace`).

### Trace steps emitted (the diagnostic vocabulary)

mutationFn (`use-create-transaction.ts`):

- `write:start` detail `onLine=<bool>` — every write begins
- `write:fastpath-offline` — `navigator.onLine` was false → enqueue path taken
- `write:post-start` — about to POST (onLine was true)
- `write:post-catch` detail `<ErrorName>` (e.g. `AbortError`, `TypeError`) — POST threw → enqueue
- `write:post-5xx` — server 5xx → enqueue
- `write:post-4xx` — genuine client error → throw (no enqueue)
- `write:post-ok` — POST succeeded

enqueue (`offline-queue.ts`):

- `enqueue:openDB` — before `openBudgetDB()`
- `enqueue:put-start` — before `db.put`
- `enqueue:put-ok` — after `db.put` (before close/notify)
- `enqueue:ERROR` detail `<name>: <message>` — IDB threw (then re-thrown)

### How to read the device screenshot

- **Hang at IDB put**: `enqueue:put-start` present, NO `enqueue:put-ok` and NO
  `enqueue:ERROR` (the `db.put` promise never settles on iOS WebKit).
- **Throw at IDB**: `enqueue:ERROR` with a name like `NotFoundError` /
  `InvalidStateError` / `QuotaExceededError`.
- **Hang before enqueue even starts**: `enqueue:openDB` present, no put-start
  (`openBudgetDB()` itself hangs) — or no enqueue lines at all (onLine lied true
  and the POST is hanging — look for `write:post-start` with no resolution).
- **Success (queue should be >0)**: `enqueue:put-ok` present.

### Verification

- `cd apps/web && bunx tsc --noEmit` → exit 0 (full project, 0 errors).
- `eslint` on all 4 touched files → exit 0, clean.
- `bunx vitest run offline-write-path offline-queue use-online-sync` → 3 files,
  23 tests passed (existing offline behavior unchanged).
- `docker compose build web` + `make restart-web` → `budget-web-1 Up (healthy)`.
- Served bundle confirmed: `OFFDBG-2` in `static/chunks/app/[locale]/(app)/
layout-29980dc7ee9c9aa8.js`; trace tokens (`write:post-start`,
  `enqueue:put-start`, `offline-trace`) in the spendings page chunk where the
  mutation runs.

### Deviations from Plan

None — pure instrumentation as specified. Only behavior delta is the transparent
try/catch-rethrow around the enqueue body (re-throw preserves the existing
contract). Also committed the Serwist-regenerated `apps/web/public/sw.js`
precache manifest (2-line hash churn) so the SW precache points at the new bundle.

### Continuation Self-Check: PASSED

- FOUND: apps/web/src/lib/offline-trace.ts
- FOUND: traceOffline calls in use-create-transaction.ts + offline-queue.ts
- FOUND: OFFDBG-2 in HTTP-served client chunk (layout-29980dc7ee9c9aa8.js)
- FOUND: commit 908d70b
