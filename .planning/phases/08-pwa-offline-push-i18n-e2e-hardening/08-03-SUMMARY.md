---
phase: 08-pwa-offline-push-i18n-e2e-hardening
plan: "03"
subsystem: offline-cache
tags: [offline, indexeddb, idb, pwa, sync, queue, cache]
dependency_graph:
  requires: [08-01]
  provides:
    [
      offline-cache,
      offline-queue,
      use-online-sync,
      use-cache-on-fetch,
      offline-status-badge,
      sync-issues-list,
    ]
  affects: [use-create-transaction, apps/web layout]
tech_stack:
  added: [fake-indexeddb@6.2.5]
  patterns:
    [
      idb openDB,
      fake-indexeddb/auto in Vitest,
      navigator.onLine fork,
      window-online replay,
      cacheBudgetSnapshot aggregator,
    ]
key_files:
  created:
    - apps/web/src/lib/offline-cache.ts
    - apps/web/src/lib/offline-queue.ts
    - apps/web/src/hooks/use-online-sync.ts
    - apps/web/src/hooks/use-cache-on-fetch.ts
    - apps/web/src/hooks/use-budget-data.ts
    - apps/web/src/components/common/offline-status-badge.tsx
    - apps/web/src/components/common/sync-issues-list.tsx
    - apps/web/test/use-online-sync.test.ts
    - apps/web/test/use-cache-on-fetch.test.ts
    - apps/web/test/offline-status-badge.test.tsx
    - apps/web/test/sync-issues-list.test.tsx
  modified:
    - apps/web/src/hooks/use-create-transaction.ts
    - apps/web/test/offline-cache.test.ts
    - apps/web/test/offline-queue.test.ts
decisions:
  - "use-budget-data.ts created as new aggregator hook — no pre-existing file matched plan's description; per-entity hooks (use-wallets, use-transactions) remain intact"
  - "fakd-indexeddb/auto import in test files replaces global indexedDB for all idb calls under happy-dom"
  - "OfflineStatusBadge uses aria-hidden=true when hidden (not CSS display:none) for accessible SR skip"
  - "wipeBudgetCache uses onblocked callback that resolves to unblock repeated test runs"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-10"
  tasks_completed: 4
  tasks_total: 4
  files_created: 11
  files_modified: 3
  tests_added: 39
requirements_satisfied: [PWAX-02, PWAX-03]
---

# Phase 08 Plan 03: Offline Cache & Write-Replay Summary

> **⚠️ SUPERSEDED (2026-06-16/17, `tasks-redesign` SPA/SWR refactor).** Everything
> recorded below was built as described, then **removed** — the IndexedDB offline
> cache + write-queue + auto-replay + cache-on-fetch + offline badge + sync-issues
> list proved too fragile on iOS. Current shipped offline: **READ** = persisted
> React Query cache (`lib/query-persist.ts` → IDB `budget-rqcache`, 365d; RQ
> `networkMode` pauses offline); **WRITE** = honest POST + rollback-toast (no queue,
> no replay); **cache-age** = `OfflineStaleBar`/`useCacheAge` (RQ `dataUpdatedAt`).
> Deleted: `offline-cache.ts`, `offline-queue.ts`, `use-online-sync.ts`,
> `use-cache-on-fetch.ts`, `offline-status-badge.tsx`, `sync-issues-list.tsx`
> (+ tests); `useBudgetData` aggregator. See **08-CONTEXT.md** banner + memories
> `project_offline_architecture`, `project_spa_swr_refactor`. _Retained as audit trail._

IndexedDB cache layer + offline write queue + same-key reconnect replay + cache-on-fetch write-path + offline badge + sync-issues list — all implemented and unit/component-tested.

## Tasks Completed

| Task | Name                                  | Commit  | Key Files                                                 |
| ---- | ------------------------------------- | ------- | --------------------------------------------------------- |
| 1    | offline-cache + offline-queue modules | fe5f29f | offline-cache.ts, offline-queue.ts, 2 test files replaced |
| 2    | use-online-sync replay + offline fork | e1a92c2 | use-online-sync.ts, use-create-transaction.ts modified    |
| 3    | OfflineStatusBadge + SyncIssuesList   | 45dd73e | offline-status-badge.tsx, sync-issues-list.tsx            |
| 4    | use-cache-on-fetch + use-budget-data  | 1dbb275 | use-cache-on-fetch.ts, use-budget-data.ts                 |

## What Was Built

**offline-cache.ts** — `openBudgetDB()` creates 6 stores (budgets/wallets/categories/transactions/offline-queue/sync-meta). `setCachedEntities()` bulk-puts to any store. `getSyncMeta`/`setSyncMeta` round-trip ISO timestamps per budgetId. `wipeBudgetCache()` deletes the entire DB for tenant isolation on logout/switch (T-08-03-01).

**offline-queue.ts** — `enqueueOfflineTxn` / `getOfflineQueue` / `removeFromQueue` / `markQueueItemFailed`. Queued items carry their `idempotencyKey` for same-key replay.

**use-online-sync.ts** — `window.addEventListener("online", replay)`. Replay re-uses `item.idempotencyKey` (NOT a fresh key). 2xx removes + invalidates 3 query keys. 4xx marks failed. 5xx/throw leaves in queue (best-effort D-02). Skips items already failed.

**use-create-transaction.ts** — offline fork at `mutationFn` entry: `if (!navigator.onLine)` enqueues to IndexedDB and returns `null` to trigger the existing `unsent: true` path (D-03 per-row pending marker).

**OfflineStatusBadge** — `data-testid="offline-status-badge"`. Hidden (`aria-hidden=true`) when online+empty. Yellow dot when online+queue>0. Red `animate-pulse` dot when offline. Uses `useTranslations("sync")`.

**SyncIssuesList** — `data-testid="sync-issues-list"`. Polls `getOfflineQueue` filtered to `failReason !== undefined`. Dismiss calls `removeFromQueue` + sonner toast. Empty = no `<li>` elements rendered.

**use-cache-on-fetch.ts** — `cacheBudgetSnapshot({budgetId, budget, wallets, categories, transactions, iso})`. Guards: null payload = no-op. Only calls `setSyncMeta` when at least one entity was written and iso is present.

**use-budget-data.ts** — New aggregator hook composing `useBudget` + `useWallets` + `useCategories` + `useTransactions`. On `allSuccess`, calls `cacheBudgetSnapshot` in a `useEffect`. Cache write failure is non-fatal (caught, not surfaced).

## Test Results

```
offline-cache.test.ts     — 10 tests  PASS
offline-queue.test.ts     — 8 tests   PASS
use-online-sync.test.ts   — 5 tests   PASS (200/422/503 branches + same-key assert)
use-cache-on-fetch.test.ts — 7 tests  PASS
offline-status-badge.test.tsx — 4 tests PASS
sync-issues-list.test.tsx    — 5 tests PASS
Total: 39 tests, all green
```

`bun run test -- offline` → 30/30 (sw-offline + 4 new suites)
`bunx tsc --noEmit` → clean

## Deviations from Plan

### Auto-fixed / Adapted

**1. [Rule 2 - Missing] use-budget-data.ts created from scratch**

- Found during: Task 4
- Issue: Plan referenced `use-budget-data.ts` as an existing file; no such file existed in the codebase
- Fix: Created new aggregator hook composing the 4 existing per-entity hooks (use-wallets, use-transactions, etc.) + wired cacheBudgetSnapshot on allSuccess
- Files modified: apps/web/src/hooks/use-budget-data.ts (new)

No other deviations — plan executed exactly as written otherwise.

## Known Stubs

None. All implemented functionality is wired end-to-end. E2E offline replay scenario is deferred to plan 08-06 per the plan's own scope statement.

## Threat Flags

| Flag                         | File                              | Description                                                                                  |
| ---------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| threat_flag: info_disclosure | apps/web/src/lib/offline-cache.ts | IndexedDB stores budget domain data; wipeBudgetCache() on logout/switch mitigates T-08-03-01 |

## Self-Check

- [x] `apps/web/src/lib/offline-cache.ts` exists
- [x] `apps/web/src/lib/offline-queue.ts` exists
- [x] `apps/web/src/hooks/use-online-sync.ts` exists
- [x] `apps/web/src/hooks/use-cache-on-fetch.ts` exists
- [x] `apps/web/src/hooks/use-budget-data.ts` exists
- [x] `apps/web/src/components/common/offline-status-badge.tsx` exists
- [x] `apps/web/src/components/common/sync-issues-list.tsx` exists
- [x] Commits fe5f29f, e1a92c2, 45dd73e, 1dbb275 exist
- [x] No SCAFFOLD sentinel in offline-cache.test.ts or offline-queue.test.ts
- [x] `bunx tsc --noEmit` clean

## Self-Check: PASSED
