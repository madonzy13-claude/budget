---
quick: 260614-nug
title: Offline replay 4xx ("could not sync") — stamp X-Budget-ID on replay/write POST
subsystem: web / PWA offline (PWAX-03)
tags: [pwa, offline, sync, tenancy, x-budget-id]
key-files:
  modified:
    - apps/web/src/hooks/use-online-sync.ts
    - apps/web/src/hooks/use-create-transaction.ts
    - apps/web/test/use-online-sync.test.ts
commits:
  - ec3066f  test(quick): RED — replay must set X-Budget-ID from queued item.budgetId
  - 14dcaef  fix(quick): stamp X-Budget-ID on offline replay + write POST
completed: 2026-06-14
---

# Quick 260614-nug: Offline replay 4xx ("could not sync") Summary

Reconnect replay POSTed without an `X-Budget-ID` header; off the budget page
`clientApiFetch` could not derive it from the pathname → tenant guard 4xx →
false "could not sync" sync-issue. Fix stamps `X-Budget-ID` from the queued
`item.budgetId` on the replay POST (and on the offline-write fallback POST).

## Root Cause (device-confirmed, code-verified)

`apps/web/src/hooks/use-online-sync.ts` replay POSTed to
`/budgets/${item.budgetId}/transactions` but its `headers` block only set
`Content-Type` + `Idempotency-Key`. `clientApiFetch`
(`apps/web/src/lib/budget-fetch.ts:23-27`) derives `X-Budget-ID` from
`window.location.pathname` ONLY when the header is absent. On reconnect the user
is usually NOT on that exact `/[locale]/budgets/[id]/...` page → header missing
or wrong → tenant guard returns 4xx → `markQueueItemFailed` → sync-issues banner.
Offline write + enqueue already worked; this was the only remaining break.

## Fix (TDD)

1. **RED** (`use-online-sync.test.ts`): new test "sets X-Budget-ID from the
   queued item.budgetId ..." mocks `clientApiFetch`, enqueues `budgetId:
"budget-abc"`, fires `online`, asserts replay POST headers include
   `X-Budget-ID: "budget-abc"`. Failed on old code (header absent) — commit `ec3066f`.
2. **GREEN** (`use-online-sync.ts`): added `"X-Budget-ID": item.budgetId` to the
   replay POST `headers` (alongside Content-Type + Idempotency-Key). Explicit
   header wins because `clientApiFetch` only injects when absent. Commit `14dcaef`.
3. **Robustness** (`use-create-transaction.ts`): added `"X-Budget-ID": budgetId`
   to the offline-write fallback POST headers (budgetId already in scope).
   Harmless online (matches pathname), correct if the write fires off-page.
   No other logic changed. Commit `14dcaef`.
4. **Considered, deliberately NOT done — failReason auto-retry.** A false-4xx from
   a missing tenant header was treated as PERMANENT (`markQueueItemFailed` →
   `if (item.failReason) continue` skips forever). With the header fix this no
   longer happens for new items. We did NOT add auto-retry of `failReason` items:
   a genuine 422 must remain permanent (auto-retry would loop forever). See user
   note below for the one-time cleanup of any item already stuck.

## RED → GREEN

- RED: `bun run test -- use-online-sync` → 1 failed | 9 passed (new test only failure).
- GREEN (isolated): each suite passes individually —
  `use-online-sync` 10/10, `offline-write-path` 7/7, `offline-queue` 7/7,
  `sync-issues-list` 5/5 (29 total, 0 failures).

## Verification

- `bunx tsc --noEmit` — clean on touched files.
- `bunx eslint` on all 3 touched files — clean (no output).
- `docker compose build web` + `make restart-web` — web container healthy
  (`Up (healthy)`).
- **Served-bundle confirmation** (inside container):
  - Replay path — `(app)/layout-d2c9e9bc9e32e68f.js` contains the exact literal
    `Idempotency-Key":t.idempotencyKey,"X-Budget-ID` (`t` = minified `item`),
    proving the replay POST now stamps X-Budget-ID from the queued item.
  - Write path — `budgets/[id]/spendings`, `settings`, `reserves` page chunks all
    contain BOTH `Idempotency-Key` and `X-Budget-ID` (use-create-transaction POST).

## Deviations from Plan

None — executed exactly as written.

## Known Stubs

None.

## Deferred Issues (out of scope — pre-existing)

`use-online-sync.test.ts` "Test C — double-trigger does NOT double-write" FLAKES
when run in the SAME multi-file vitest pool as `offline-write-path` /
`offline-queue` / `sync-issues-list` (shared fake-indexeddb + slow-resolving
mock + `setTimeout(0)` race). Confirmed pre-existing: with the fix STASHED
(baseline code), the same multi-file command failed Test C 3/3 runs. Test C
passes reliably when `use-online-sync` runs isolated (10/10). Not caused by this
change; not fixed here (scope boundary).

## Note for User — dismiss pre-existing stuck sync-issue

The header fix prevents NEW false-4xx sync-issues. It does NOT auto-retry items
already stuck in sync-issues (by design — a real 422 must stay permanent). If you
have an existing "could not sync" item from before this fix, open the sync-issues
banner and **Dismiss** it; the next offline write will queue and replay cleanly
with the correct tenant header.

## Self-Check: PASSED
