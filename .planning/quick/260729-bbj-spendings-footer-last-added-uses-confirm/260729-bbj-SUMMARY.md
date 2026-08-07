---
id: 260729-bbj
slug: spendings-footer-last-added-uses-confirm
date: 2026-07-29
status: complete
---

# Quick 260729-bbj — Summary

## What changed

- `packages/budgeting/src/adapters/persistence/transaction-repo.ts` —
  `latestSpendingCreatedAt` now returns `max(confirmed_at)` instead of
  `max(created_at)`. Filters unchanged: confirmed-only, `deleted_at IS NULL`,
  month scoped by `transaction_date`.
- `apps/api/test/routes/spendings-summary.test.ts` — new `seedDraftAt` helper
  (separate `created_at` / nullable `confirmed_at`); `seedTransactionAt` now
  seeds `confirmed_at = created_at` (a manual spending is confirmed on create);
  new test `ignores unconfirmed drafts and dates confirmed drafts by their
  confirmation`.

## Why

Unconfirmed drafts were already excluded from the footer. The remaining leak was
timestamps *from* the draft era: a recurring draft is an `expense_ledger` row the
worker creates (`created_at` = 06:00 generation) and the user confirms later
(`confirmed_at = now()`, `created_at` untouched). Once confirmed, the footer read
the generation time — a moment when the row was still an unconfirmed draft.

## Verification

`bun test apps/api/test/routes/spendings-summary.test.ts` (real Postgres):
red 8 pass / 1 fail before the repo change, green 9 pass / 0 fail after.
`bunx tsc --noEmit` (apps/api) and `eslint --max-warnings=0` on touched files: clean.
`docker compose build api worker`: both images built.

## Data note (dev)

For `Private Budget` July 2026 the displayed value does not move: the newest
confirmed row is the 2026-07-26 17:30Z "House building (reclassified)" import
(`created_at == confirmed_at`), and the 2026-07-27 06:00Z recurring rows are
still unconfirmed, so they were already excluded. The change matters the moment
one of those drafts is confirmed — the footer will read the confirmation time
instead of 06:00.

## Not deployed

`make restart-api` / `restart-worker` wrap `infisical run`; the Infisical session
has expired, so the new images are built but the running containers still serve
the old code.
