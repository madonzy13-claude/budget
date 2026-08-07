---
id: 260729-bbj
slug: spendings-footer-last-added-uses-confirm
date: 2026-07-29
status: in-progress
---

# Quick 260729-bbj — "Last spending added" must never report a draft-era timestamp

## Problem

Spendings grid footer (`Last spending added {when}`) is fed by
`SpendingsSummary.lastSpendingAddedAt`, produced by
`DrizzleTransactionRepo.latestSpendingCreatedAt`
(`packages/budgeting/src/adapters/persistence/transaction-repo.ts:350`).

The query already excludes unconfirmed drafts (`confirmed_at IS NOT NULL`), but it
returns `max(created_at)`. Recurring drafts are `expense_ledger` rows created by the
worker (`created_at` = 06:00 generation time) and later flipped to confirmed
(`confirm-recurring-draft.ts` sets `confirmed_at = now()`, `created_at` untouched).
So once such a draft is confirmed, the footer shows the moment the *draft* was
generated — a datetime that belongs to the unconfirmed-draft state, not to the
spending being added.

Live example (budget `Private Budget`, July 2026): row "Alimony" `created_at`
2026-07-15 06:00Z (worker draft) / `confirmed_at` 2026-07-15 17:54Z (user confirm).

## Fix

`max(confirmed_at)` instead of `max(created_at)`; filters unchanged
(confirmed-only, `deleted_at IS NULL`, month scoped by `transaction_date`).
For manually added spendings `confirmed_at == created_at`, so nothing else moves.

## Tasks

1. **(red)** `apps/api/test/routes/spendings-summary.test.ts`
   - `seedTransactionAt` seeds `confirmed_at = created_at` (was `now()`) so manual
     rows are self-consistent with the new semantics.
   - New helper `seedDraftAt(...)` (explicit `created_at` + nullable `confirmed_at`).
   - New test: unconfirmed draft with the newest `created_at` is ignored, and a
     confirmed draft (created 2026-05-01T06:00Z, confirmed 2026-05-03T17:00Z)
     reports **2026-05-03T17:00Z**.
2. **(green)** `packages/budgeting/src/adapters/persistence/transaction-repo.ts`
   — `SELECT max(confirmed_at)`, comment explaining the draft-era leak.
3. Run the spendings-summary integration suite against real Postgres.

## Verify

`DATABASE_URL_APP=... bun test apps/api/test/routes/spendings-summary.test.ts`
— all `lastSpendingAddedAt` tests green, including the new one.
