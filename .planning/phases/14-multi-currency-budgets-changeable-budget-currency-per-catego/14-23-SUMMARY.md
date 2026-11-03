---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 23
subsystem: budgeting/web
tags: [gap-closure, owner-feedback]
requirements-completed: [D-04, D-07, D-08, D-17]
---

# 14-23 Summary: second round of owner feedback

| # | Feedback | Fix |
|---|----------|-----|
| 1 | A foreign quick entry flashed in the budget currency | Create/edit replies carried `currency_converted` = the original currency, so the optimistic row briefly showed the USD figure under €. Replies now name the budget currency (route test). The summary also computes `own` for a foreign category without a limit. |
| 2 | PLN→EUR→PLN gave 200.20, not 200 | Migration 0105 `category_limits.converted_from jsonb` keeps the amounts a conversion was made from. A currency change converts from that source, and switching back restores it exactly. Typed writes clear it. The summary exposes it as `limitOriginal.convertedFrom`; the slider uses it as the basis. A save that only changes the currency no longer re-posts the rounded preview over the server's conversion. |
| 3 | Remove the "Totals are shown…" explanation | Owner follow-up: keep its first sentence. en/pl/uk now read only "Totals are shown in this currency." |
| 4 | Pie proportional to the actual limit | Verified: the overview planned query converts every limit through `fx_convert` at the D-08 rate date. New DB test: a EUR limit in a PLN budget gives the same pie input as the spendings column. The pie still averages over the selected range (existing design). |
| 5 | Reserve rows should name their currency, aligned | A fixed-width muted code column follows the amount, outside the editable cell. All amounts share one right edge (phone 320px / desktop 1194px, verified live). Footer per-currency parts wrap one by one, so 3 currencies no longer run off a phone-width card. |

## Verification
- Backend: change-category-currency (exact round trip + source exposed), limit-rate-date (+ pie input), category limits / summary / currency routes: all green.
- Web Vitest: slider currency (server source basis, preview-only save skips the limits POST, edited amount still saves), reserves row, i18n keys.
- api + worker + web rebuilt; reserves tab screenshotted live on phone + desktop.
