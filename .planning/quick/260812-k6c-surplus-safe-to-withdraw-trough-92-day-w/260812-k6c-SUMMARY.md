---
quick_id: 260812-k6c
status: complete
date: 2026-08-12
commit: 0232dc51
---

# Quick Task 260812-k6c — Surplus = what you can actually withdraw

## The decision behind it

The household's definition (user, 260812): _the amount I can take out of the
budget today — to invest — and still be OK across the whole forecast; it must
not change just because a day passed._

The old figure was projected cash on the day before the nearest income. Two
problems: it only coincides with the low point when income dwarfs spending, and
it climbed every morning the household underspent (13,069 → 13,235 → 13,389 on
Private with nothing changing) because an even drip pushes more of the plan past
each future date as today advances.

Rejected on the way: the pro-rata rule (each day owns 1/N of the plan, the
passed days' share evaporates) — the user had already rejected it for the line,
and it drifts too.

## Shipped

1. **Surplus = the trough.** `min(available)` across the window, with the day it
   falls on. Withdraw it and the thinnest day sits exactly on zero — asserted by
   a test that withdraws the figure and re-runs the simulation.
2. **Worst-case schedule for that figure only.** `spendTiming: "immediate"` —
   each month's remaining plan is charged the moment the month opens. The line
   keeps the even drip. Properties under test: a day passing changes nothing,
   spending inside the plan changes nothing, overspending moves it złoty for
   złoty.
3. **The reserve still stands behind it** (user's call): a payment landing on a
   category whose plan is gone is what the pot is for, so it may cover it rather
   than reading as a hole. Test pins both sides: pot 100k → trough 0, pot 0 →
   trough −50k.
4. **92-day rolling horizon** replaces "to the end of next month", which
   forecast one month on the 30th and two on the 1st. Category plans are read
   per month across the four months a quarter can touch (`budgetByMonth`),
   replacing this-month/next-month.
5. **Cushion wallets are not spendable cash.** Moving cushion money to a
   spendings wallet is a deliberate act; the forecast no longer makes it.
6. Card shows the figure + the day it is measured at (`formatDayMonthShort`,
   one Intl call so uk/pl keep the genitive).

## Verification

- `simulate-cashflow-projection.test.ts` — 22 pass (7 new, incl. the stability
  and withdraw-to-zero properties).
- `overview-projection.test.ts` on real Postgres — 5 pass, incl. `days === 92`.
- `overview-cards.test.tsx` 23 pass, `format-date.test.ts` 8 pass; full web
  suite 2,217 pass.
- **Live loader run against the real dev data** (throwaway probe, removed):
  - Private: 92 days (12 Aug → 11 Nov), start cash 15,756 (cushion excluded),
    day-1 burn 164.37, line trough 13,068.52 on 15 Aug,
    **safe to withdraw 10,438.56** (thinnest 15 Aug).
  - Family: no income configured at all → line red from day one,
    safe to withdraw −34,394.04 (thinnest 5 Nov). Flagged to the user: that
    budget is funded by transfers, which the forecast cannot see as income.
- Live UI on a seeded budget: cushion wallet of 9,000 correctly excluded
  (opening 1,500), card read "Surplus · 1 Nov $700" against an API
  `safe_to_withdraw` of 70000 with `thinnest_date 2026-11-01`.

## Not done

The category-limit suggestion for the Future chart (user's item 2). The premise
needs checking first — see the question raised in the session: the suggestion
already adds every recurring rule at its CURRENT amount, and Insurance's rules
sum to 798 today while the limit sits at 779 (a value that entered via the CSV
history rebuild on 2026-07-12, before those rules existed).
