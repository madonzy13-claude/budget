---
quick_id: 260614-i5m
type: quick
status: awaiting-device-verification
requirements: [PWAX-03]
files_modified:
  - apps/web/src/hooks/use-create-transaction.ts
  - apps/web/test/offline-write-path.test.tsx
commits:
  - 5c576b3 # test (RED)
  - b7f74fd # fix (GREEN)
completed: 2026-06-14
---

# Quick 260614-i5m: Offline write fork must fall back on fetch-failure Summary

Fetch-failure-driven offline fallback + 8s write timeout in `use-create-transaction.ts`:
a dead-network write on iOS (where `navigator.onLine` lies as `true`) now enqueues,
clears the perpetual spinner, and shows the Clock "Pending" marker — instead of hanging
forever. Idempotency preserved via single-key reuse (no double-write on replay).

## Root cause (Phase 08 UAT test 4, iOS device-confirmed)

iOS Safari/PWA reports `navigator.onLine === true` on a dead link. The mutationFn forked
to the offline queue ONLY on `onLine === false`, so the write fell through to the real
POST — which had NO timeout and hung forever. `pending:true` (set in onMutate) only
clears in onError/onSuccess, neither of which fired on a hung fetch → stuck `Loader2
animate-spin`. The queue insert lived only in the skipped offline fork, so the Clock
marker (gated on the row's key being in IndexedDB) never showed.

## Final mutationFn shape (`use-create-transaction.ts`)

1. `const key = input.idempotencyKey ?? generateIdempotencyKey()` — unchanged (line ~90).
2. `payload` built once (shared by POST + fallback enqueue).
3. `fallbackToQueue()` helper: `enqueueOfflineTxn({ idempotencyKey: key, ... })` then
   `throw new OfflineEnqueuedError()` (routes to onError → keeps row, `pending:false`,
   `unsent:true`).
4. Fast path: `if (!navigator.onLine) return await fallbackToQueue();` — unchanged behavior.
5. POST now carries `signal: AbortSignal.timeout(8000)` (write-only; reads via
   clientApiFetch untouched, budget-fetch.ts unchanged) + `Idempotency-Key: key`.
6. `catch` (network TypeError "Failed to fetch" OR AbortError timeout) → `fallbackToQueue()`.
7. `if (!res.ok)`: `res.status >= 500` → `fallbackToQueue()` (retry later);
   `4xx` → `throw new Error(await res.text())` (real validation error, NO enqueue — a 4xx
   in the queue would replay-loop forever).
8. `return (await res.json()).transaction` on 2xx.

`onMutate` / `onError` / `onSuccess` / `onSettled` untouched. `budget-fetch.ts` untouched
(signal already forwarded via `{ ...init, headers }`).

## Idempotency

SAME `key` used for the POST `Idempotency-Key` header AND the fallback enqueue. On replay,
use-online-sync POSTs with the same key → if the original POST actually reached the server
(response lost on a flaky link), the server dedupes → no double-write. No new key is ever
minted on the fallback path.

## Tests

RED-first (commit 5c576b3) — 3 new failing tests + 1 render assertion, 4 already-green
(3 prior + 4xx guard):

- `network reject while online enqueues and clears pending` — `setOnline(true)` +
  `mockRejectedValue(new TypeError("Failed to fetch"))` → queue length 1, `pending===false`,
  `unsent===true`, `mockFetch` called once (proves real POST attempted, then fell back).
- `aborted/timed-out write while online enqueues and clears pending` — `AbortError`
  (DOMException) → same assertions (deterministic equivalent of the 8s timeout abort).
- `genuine 4xx stays a real error, does NOT enqueue` — 422 → row `unsent===true` (kept),
  queue length 0 (no replay loop).
- `fallback row renders the Clock pending marker and NO spinner` — renders the resulting
  optimistic row through the real `TransactionRow`: `txn-pending-<id>` present, no
  `.animate-spin`.

GREEN (commit b7f74fd): all 11 offline-write-path + marker tests pass.

Full regression (env-note suite) — 30/30 green across 6 suites:
`offline-write-path offline-queue offline-status-badge transaction-row-marker
use-online-sync offline-shell-wiring`. use-online-sync replay/sync + sync-issues 4xx path
unaffected. Online quick-entry happy path unchanged (201 still POSTs, no enqueue).

`bunx tsc --noEmit` → exit 0 (full pass). eslint clean on touched files.

## offline-status-badge red-dot hardening: DEFERRED (cosmetic)

Per the plan's scope guard, NOT done. The badge already shows the YELLOW (`--primary`)
pending-sync dot whenever `queueCount > 0`, which now fires on the iOS dead-network path
because the write enqueues. The red `--destructive` dot is gated on `!isOnline`
(navigator-driven), so on iOS where navigator lies it stays yellow — but the user STILL
gets a visible pending indicator (yellow) + the per-row Clock marker. The red-on-iOS
change is cosmetic, not the bug, and would require a heuristic (recent write failure /
non-empty queue → treat as offline) that risks false reds. Left as a follow-up note.

## Deploy / verify (mechanical, pre-checkpoint)

- `docker compose build web` → fresh image `budget-web:latest` (rebuilt, not cache-hit).
- `make restart-web` → `budget-web-1` recreated, `Up ... (healthy)`.
- Served-bundle grep confirms freshness: `AbortSignal.timeout(8e3)` present in BOTH
  `.next/server/app/[locale]/(app)/budgets/[id]/spendings/page.js` AND the client static
  chunk `.next/static/chunks/.../spendings/page-*.js` — new code is shipped.

## Deviations from Plan

None — plan executed as written. Optional red-dot hardening deferred per scope guard (noted above).

## Device confirmation result

PENDING — checkpoint:human-verify. User to confirm on iOS PWA at
https://budget-dev.madonzy.com: airplane mode → quick-enter expense → within ~8s row
stops spinning and shows Clock "Pending" (no perpetual spinner) → re-enable network →
row syncs, marker clears, no duplicate row.

## Self-Check: PASSED

- `apps/web/src/hooks/use-create-transaction.ts` — modified, FOUND (commit b7f74fd).
- `apps/web/test/offline-write-path.test.tsx` — modified, FOUND (commit 5c576b3).
- Commit 5c576b3 (test RED) — FOUND in git log.
- Commit b7f74fd (fix GREEN) — FOUND in git log.
- Served bundle contains `AbortSignal.timeout(8e3)` (server + client chunk) — FOUND.
