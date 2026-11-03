---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 22
subsystem: budgeting/web
tags: [gap-closure, owner-feedback]
requirements-completed: [D-02, D-03, D-07, D-10, D-12]
---

# 14-22 Summary: owner feedback on the 14-21 check

| # | Feedback | Fix |
|---|----------|-----|
| 0 | "tato" was 1000 EUR, "dima podatki" $300 | Rows 8973979d / 08f3316e: currency_original → EUR / USD, fx_rate set to stored/original. Read-time: tato 4369.50 PLN (exact); dima 1167.18 PLN vs stored 1170.39 (the official 10-16 USD rate differs from the one used at entry). |
| 1 | Always show the short currency sign | FxAmount always signs (also budget-currency rows); every column-header figure (used / limit, reserve used / available, overspent, spent chip) carries the column's sign. |
| 2 | A PLN category in a EUR budget showed "used" converted | Spendings summary adds `own` (category-currency spent at each row's date via `spendByCategoryForMonthInCategoryCurrency`, limit as typed, native reserve cells); the column header reads it. Totals/charts keep the budget-currency fields. |
| 3 | No "≈" line | Removed (`column-limit-equivalent` gone). |
| 4 | Settings currency shifted left on iOS | `[text-align-last:right]` on the select (iOS ignores text-align on selects; same fix as wallet rows). |
| 5 | Slider PLN→EUR→PLN drifted 1–2 gr | Conversions always start from the amounts as typed in the stored currency; switching back restores them exactly. (A SAVED A→B→A change on the server still rounds twice.) |
| 6 | Reserve fit / category charts / rebalance | Audit found 9 sites mixing category-currency engine values with budget currency. `positionsInBudget()` converts at today's rate for reserve fit, overview planned + overspent (incl. reserve pie) and the cash-flow reserve pool. Rebalance dialogs send `currency` / `amountsCurrency`; adjust + limit routes convert into the category currency (`convert-to-category-currency.ts`) and the adjust reply adds `reserveCentsIn`. Reserves-tab cover notice uses the row currency. |
| 7 | Reserve footer "5 / 5 EUR" lines unreadable | Removed; TOTAL NEEDED / TOTAL HELD read as their per-currency parts ("50 EUR + 120 PLN"). |

## Verification
- Backend: budgeting + api routes 1487 pass; only the baseline `/scheduled-payments` failure remains (route-coverage + overspent pie fixed). New tests: own-currency column (reserve-dtos-by-currency), positions-in-budget, convert-to-category-currency.
- Web Vitest 3065 pass / 0 fail (txn-row + header tests updated for always-signed figures).
- E2E + rebuilt images: see the gate run below.
