---
id: 260825-spb
slug: scheduled-backfill-cap-and-draft-purge
date: 2026-08-25
mode: quick
---

# Scheduled payments: cap the back-fill, purge drafts on delete

Two user-reported gaps, both in the scheduled-payments lifecycle.

## 1. Cap inline back-fill at 12 months

`create-scheduled-payment.ts` walks a catch-up loop from `first_due_date` to
today, one `INSERT` per missed period, **synchronously inside the request**:

```ts
let dueDate = Temporal.PlainDate.from(input.firstDueDate);
while (compare(dueDate, today) <= 0 && !isRuleExhausted(...)) { ... }
```

A 2020 anchor is ~80 inserts today and one more every month; 2015 is ~130. The
user waits for all of them.

**Change:** start the loop at `max(firstDueDate, today − 12 months)`. The rule
itself still records the true `first_due_date` — only the drafts are bounded.
Anything older is history the household is not going to reconcile anyway.

## 2. Deleting a rule must remove its unconfirmed drafts

`softDelete` flags the rule (`active=false, deleted_at=now()`) and leaves every
draft it generated sitting in `budgeting.expense_ledger`. They keep showing in
the grid and in the Tasks queue for a rule that no longer exists.

**Change:** in the same transaction, delete the rule's drafts, mirroring the
pattern category archive already uses (`category-repo.ts:297`):

```sql
DELETE FROM budgeting.expense_ledger
 WHERE scheduled_payment_id = <rule> AND tenant_id = <tenant>
   AND confirmed_at IS NULL
```

**Confirmed transactions MUST survive** — once confirmed, a draft is real money
the household spent, and the rule's deletion says nothing about it. That is the
assertion worth writing first.

`CONFIRM_DRAFT` tasks need no separate cleanup: the read-time self-heal
(260612-kxd T3) hides any whose draft is no longer live.

## TDD — failing tests first

`apps/api/test/routes/scheduled-payments.test.ts` (real Postgres):

1. **back-fill cap** — MONTHLY rule anchored 3 years back → the oldest draft's
   `transaction_date` is not older than ~12 months, and the count is bounded
   (≤13), where today it would be ~36.
2. **delete purges drafts** — back-dated rule generates drafts, confirm ONE,
   `DELETE` the rule, then: unconfirmed drafts for that rule are gone AND the
   confirmed row is still there.

Both must be seen RED before the implementation lands.

## Verify

- `make test` (now with the real `--timeout`, so a slow back-fill fails loudly
  rather than at bun's silent 5s default)
- Playwright live against `https://budget-dev.madonzy.com`, targeted
  (`--grep`), not the full 1.4h suite
