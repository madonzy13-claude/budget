---
quick_id: 260812-fya
status: complete
date: 2026-08-12
commit: bf9c8a65
---

# Quick Task 260812-fya — Summary

## What the investigation found

The report was "the forecast smears the whole limit per day and forgets the
passed days". Measured against the **running** API (not the source): the burn
was already `(plan − spent − dated bills) / days_left`. Private Budget, Aug 12:
10,423 planned − 30 spent − 2,858 bills = 7,568 over 20 days = **378.40/day**,
and the line's first cell was 15,756 − 378 = 15,378.

The user's own arithmetic expected the pro-rata rule instead (10,423 × 20/31 =
6,724, i.e. the passed days' unspent 3,669 evaporating) — the very thing their
first message objected to. Presented both; **they chose to keep the current
rule**: money not spent in the days already gone is still money you plan to
spend.

So the defects were about legibility and one genuine hole, not the burn rule.

## Shipped

1. **The day reads out as one equation.** `DayCell` now carries `openingCents`,
   `plannedBurnCents` and `reserveCoveredCents`, and the invariant
   `available = opening + income − bills − plannedBurn + reserveCovered` is
   asserted for every cell of the window. The tooltip renders it, so the gap
   between the card (15,756) and the first cell (15,378) is now visibly one
   day's planned spend.
2. **Pending occurrences are visible.** A scheduled payment whose date passed
   unconfirmed was in neither place the projection looks — generating its draft
   rolls `next_due_date` forward, so it stops being a dated bill without ever
   becoming confirmed spend. The loader reads those unconfirmed, undismissed
   ledger rows; the tooltip lists them on today's cell with their due date under
   "Not confirmed yet". Per the user's choice they move **no cash** — the money
   already rides inside the daily burn, and counting it again would draw the
   same payment twice.
3. **Pie centre stops lying.** "All categories" now becomes "N categories" once
   the picker narrows anything — unless the only thing dropped is the investment
   category, which is not planned spending and so narrows nothing.

## Verification

- `simulate-cashflow-projection.test.ts` — 15 pass (4 new: opening on day one,
  the invariant across every day, reserve as a term, pending moves no cash).
- `overview-projection.test.ts` (real Postgres) — 3 pass, incl. the equation
  closing over the serialised strings. Fixed one stale pre-existing assertion
  (`spend_health.good` expected the pre-260811 `null`).
- `projection-timeline.test.tsx` — 9 pass; `planned-category-filter.test.ts` — 13.
- Full web suite: 2,214 pass / 34 skipped. `tsc --noEmit` clean on web + api.
- **Live** against the rebuilt dev stack, seeded fresh user: API returns
  `opening_cents` / `planned_burn_cents` / `reserve_covered_cents` /
  `pending_points`; tooltip read
  `Start of day $1,500 · − Planned spend $31 · Left $1,469 · NOT CONFIRMED YET ·
T-Mobile · 8 Aug 2026 $30`.

Pre-existing failures left alone: 4 in archive/unarchive use cases, and the
`get-budget-home-summary` / `get-spendings-summary` / `list-pending-tasks` type
errors — none touch this path.

## Side finding (no code change)

"Select all" in the category picker was reported as yellow again in light theme.
The fix (335425ff, `--accent-ink`) is intact: the served CSS maps
`text-[var(--accent-ink)]` to `#181a20` under `:root[data-theme="light"]`, the
served JS still carries that class, and a real browser reports
`rgb(24, 26, 32)`. The screenshot came from a stale client (SW-cached bundle).
