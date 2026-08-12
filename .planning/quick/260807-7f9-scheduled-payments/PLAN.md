---
id: 260807-7f9
slug: scheduled-payments
date: 2026-08-07
mode: quick (3 phases, one commit each)
---

# Scheduled payments

Three changes the household asked for on 260807, in the order they have to land.

## Decisions taken (user, 260807)

| Question | Answer |
|---|---|
| Depth of the rename | Everything, database included |
| The word | **scheduled payments** (not "planned" — that name is taken by the Overview's spend plan) |
| pl / uk | **Zaplanowane płatności** / **Заплановані платежі**; one-time = *Jednorazowo* / *Одноразово* |
| API route | `/budgets/:id/scheduled-payments`, no alias for the old path |
| One-time payment, once it has fired | auto-deactivates, sinks to the bottom of the list, reads as disabled; still editable (moving its date moves the draft) until its draft is CONFIRMED, after which only deletion is offered; no active/inactive control in the form — a past date *is* inactive |
| Chart horizon | today → the latest `next_due_date` across all active payments (one-time ones included, since their date is their next due) |
| Horizon cap | none; the chart and the reserve-fit forward leg both run to that same date |

## Phase 1 — the rename (this is the only behaviour-neutral phase)

Migration 0077 renames the table, both policies, four CHECK constraints, two
indexes, the ledger's FK column, its FK constraint and its partial unique index.
`post-migration.sql` re-asserts all of it by name on every deploy, so it moves
too. Then the code: schema, ports, repos, application services, the worker
handler, the API route and its path, the web components and query keys, and the
i18n keys plus copy in all three locales.

The pg-boss queue keeps its old name (`recurring-engine`): renaming it would
orphan queued jobs, and it is invisible to the household.

TDD: `scheduled-payments-rename.test.ts` asserts every renamed object by name
against real Postgres (red 7/7 before the migration). Behaviour is proved by the
existing suites, which must stay green unchanged.

## Phase 2 — the ONCE cadence

A one-time payment is **a payment whose deadline is its own date**. That reuses
the end-date machinery already in the engine: the catch-up loop stops at
`end_date`, and `isRuleExhausted` deactivates the payment afterwards. So ONCE
needs a CHECK-constraint value, a cadence-union member, `end_date` forced equal
to the date at write time, and a `nextOccurrence` that steps past it — not a new
lifecycle.

Form: cadence gains "One time"; picking it hides the last-date field (it is
implied) and the anchor/weekday/month sub-fields.

Editing: moving the date moves the draft (the existing `applyToFuture` path).
A payment whose draft is already confirmed is read-only — deletion only.

## Phase 3 — the chart and the reserve horizon

"Recurring payments, by month" becomes **"Upcoming scheduled payments, by
month"**: today → `max(next_due_date)` across active payments, replacing the
`recurringMonthlyNormalize` rate view that spread a yearly charge over twelve
months. Reserve-fit's forward leg takes the same horizon instead of
`FORWARD_MONTHS = 12`, and one-time payments land as `onTop` in their own month
so they are actually reserved for.
