---
quick_id: 260812-fya
description: Forecast tooltip shows the spend equation and pending unconfirmed payments
date: 2026-08-12
mode: quick
---

# Quick Task 260812-fya — Money-forecast line: make the daily figure legible

## Background (measured, 2026-08-12, Private Budget)

The user read the line as "the whole limit is smeared per day and passed days are
forgotten". Measured against the running API, the burn is already
`(plan − spent − bills still dated) / days_left`:

|                                           | value                         |
| ----------------------------------------- | ----------------------------- |
| plan (17 categories, normal mode)         | 10,423 zł                     |
| confirmed spend so far in August          | 30 zł                         |
| scheduled payments still dated this month | 2,857.99 zł                   |
| discretionary remainder                   | 7,568 zł                      |
| ÷ 20 days left                            | **378.40 / day**              |
| wallets (SPENDINGS)                       | 15,756 zł → first cell 15,378 |

**Decision (user, 260812):** keep this rule — unspent plan from passed days does
NOT expire. Rejected the pro-rata alternative (10,423 × 20/31 = 6,724).

Two real defects remain:

1. The line's first cell (15,378) never equals the "available to spend" card
   (15,756) and nothing on screen explains the 378 gap.
2. A scheduled payment whose date passed unconfirmed leaves both sides of the
   maths: it is no longer a dated bill (the rule's `next_due_date` has rolled
   forward) and it is not confirmed spend. Its money rides invisibly inside the
   discretionary smear. **User's choice: keep it in the smear, surface it in the
   tooltip only** — no change to the line's shape.

## Tasks

### Task 1 — simulator exposes the terms of the equation (bun:test first)

`packages/budgeting/src/application/simulate-cashflow-projection.ts`

`DayCell` gains:

- `openingCents` — cash entering the day (before income and outflows)
- `plannedBurnCents` — the discretionary smear applied that day (all categories)
- `reserveCoveredCents` — Σ `drewReserve` (reserve-paid spending never touches cash)

Invariant the tooltip renders and the test asserts:

```
available = opening + income − bills − plannedBurn + reserveCovered
```

`CashflowSimInput` gains `pendingDrafts?: CashflowEvent[]`, echoed to
`CashflowProjection.pendingPoints`. Pass-through only — pending money must NOT
move cash (it is already inside the burn; adding it would double-count).

### Task 2 — loader reads the pending drafts

`packages/budgeting/src/application/compute-cashflow-projection.ts`

Query unconfirmed, non-deleted `expense_ledger` SPENDING rows dated ≤ today, FX
each to the budget currency, pass as `pendingDrafts` (date = its original date,
so the tooltip can say how long it has been drifting).

### Task 3 — API surfaces the new fields

`apps/api/src/routes/overview-projection.ts`: `opening_cents`,
`planned_burn_cents`, `reserve_covered_cents` per day + top-level
`pending_points`. Integration test asserts they serialise.

### Task 4 — tooltip renders the equation + pending section

`apps/web/src/components/budgeting/overview/projection-timeline.tsx`

Reading order: **Available (start) → + income → − scheduled → − planned spend →
= left**, with the result emphasised, then the existing reserve/uncovered
sections, then a "Not confirmed yet" section listing pending drafts (their date +
amount) whenever the hovered day is today. i18n EN/PL/UK.

Vitest asserts the equation rows and the pending section.

## must_haves

- truths: today's tooltip shows the card's figure as the opening; the equation closes; pending drafts are listed
- artifacts: simulator + loader + route + tooltip + messages(en,pl,uk) + tests
- key_links: packages/budgeting/src/application/simulate-cashflow-projection.ts
