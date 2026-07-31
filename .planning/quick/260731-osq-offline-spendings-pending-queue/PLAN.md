---
task: Offline spendings become a persisted PENDING row (no popup, no rollback)
slug: osq-offline-spendings-pending-queue
created: 2026-07-31
mode: quick
---

# Offline spendings → persisted pending row

## Problem

Adding a spending while offline (or on a dead link) pops an AlertDialog and the
just-typed row is thrown away (`use-create-transaction` rolls back the optimistic
row; `quick-entry-input` short-circuits before mutate). The user retypes it later.

## Change (user request, 2026-07-31)

1. No popup. A bottom toast ("saved when you're back online") — same surface as a
   settings-saved toast.
2. The spending STAYS in its column as a PENDING row with a retry marker, and
   survives tab/app close (localStorage), retried automatically when back online.
3. Delete works on pending rows (offline-capable: it only drops the local entry).
4. Edit (pen) chip hidden on EVERY transaction row while offline.
5. Delete chip hidden on SAVED rows while offline — visible only on pending rows.

This deliberately re-introduces a *narrow* write queue for ONE surface (spendings
quick-add) after the 2026-06 "robust-minimal, no queue/replay" decision
(`project_offline_architecture`). Scope guard: only quick-add creates enqueue;
every other write keeps the honest-refuse `clientApiWrite` contract.

## Design

**New** `apps/web/src/lib/pending-spendings.ts` — localStorage store
(`budget-pending-spendings-v1`), entries `{id, idempotencyKey, budgetId, month,
categoryId, amountCents, currency, date, note, createdAt}`.
`listPendingSpendings / addPendingSpending / removePendingSpending /
subscribePendingSpendings` + `flushPendingSpendings()` (sequential POST via
`clientApiWrite` with the STORED Idempotency-Key so a lost response can't double
-post; stops on OfflineWriteError, drops the entry on a genuine 4xx).

**New** `apps/web/src/hooks/use-pending-spendings.ts` — `usePendingSpendings(
budgetId, month)` via `useSyncExternalStore` (subscribes to the store + the
cross-tab `storage` event).

**New** `apps/web/src/components/common/pending-spendings-flusher.tsx` — mounted
once in the (app) layout: flush on mount and on `online`, then
`queryClient.invalidateQueries()`.

**Edits**
- `use-create-transaction.ts` — `onOfflineError(input)` now carries the input so
  the lying-true rollback path can enqueue exactly what was typed.
- `quick-entry-input.tsx` — offline (or offline-error) → `addPendingSpending` +
  success toast; `onOfflineAttempt` prop deleted.
- `category-column.tsx` / `spendings-grid-client.tsx` — drop `onOfflineAttempt` +
  the shared offline AlertDialog; merge pending entries (as `pending: true`
  TxnDTOs) on TOP of each category's transaction list.
- `transaction-row.tsx` — `pending` rows show a retry marker, no pen, and their
  delete removes the local entry; online-only chips gated by `useConnectivity()`.
- `messages/{en,pl,uk}.json` — add `grid.txn.pending.{queued,badge}`, drop
  `grid.offlineDialog.*`.

**Not doing** (ponytail): pending amounts are NOT folded into the category
summary/limit math — the engine owns that split and reconciles on flush.

## TDD order

1. `test/lib/pending-spendings.test.ts` — persistence, filter, remove, subscribe.
2. `test/lib/pending-spendings-flush.test.ts` — flush posts w/ stored key, removes
   on 2xx, KEEPS on offline error, drops on 4xx.
3. `test/components/spendings-grid/quick-entry-input.test.tsx` — offline Enter/blur
   enqueue instead of dialog.
4. `test/components/spendings-grid/transaction-row.test.tsx` — pending marker, no
   pen on pending, delete drops the entry, offline hides pen (all) + delete (saved).
5. i18n key test + grid-client dialog test updated.
