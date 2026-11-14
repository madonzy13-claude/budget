---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 24
subsystem: budgeting/api/web
tags: [gap-closure, code-review]
requirements-completed: [D-02, D-07, D-08, D-10, D-12, D-17]
---

# 14-24 Summary: code review fixes

Every fix starts from a failing test: red without the change, green with it.

| Finding | Fix |
|---|---|
| CR-01 past segment relabelled (PLN 200 → "€200") | The summary converts a segment still in an old currency into the category's currency at the D-08 date. This covers `limitOriginal`, `limitCurrency` and `own`. Test in limit-rate-date: a PLN segment in a EUR category reads 125.00 EUR. |
| CR-02 smart Investments own figures | A smart Investments row never takes `own`; its figures stay in the budget currency. |
| CR-03 limit in any currency | `setLimitSchema` currencies are `FIAT_CURRENCIES`. The route refuses a currency other than the category's (`currency_mismatch`, 422). One E2E helper stopped sending a hard-coded EUR. |
| WR-01 adjust 500 | Validate before converting. The harness gained the deps the `as never` cast had hidden. |
| WR-02 partial save | A failure after the committed currency change refetches the grid. *Deferred:* one atomic call (noted in code). |
| WR-03 unsupported txn currency | Create and edit refuse a currency outside `FIAT_CURRENCIES` (422). |
| WR-04 wealth fake 0 | Snapshots with no FX pair drop out of the series and the opening value. |
| WR-05 "top up 0" / mixed directions | The task keeps only lines in its direction. With no net, the amount comes from the line. Positions set `fxUnavailable` when the settlement could not convert a currency. |
| WR-06 split ≠ limit | wants = converted normal − converted needs, in the route and in the currency change (UPDATE and INSERT). |
| WR-07 unarchive currency | Every segment is in the category's currency. An archive-month limit in an old currency restores as 0. |
| WR-08 several "today"s | `/fx/rate` takes an optional date (server today). The slider omits it, and the converter and the income/cushion tasks use `serverNow`. |
| WR-09 legacy limit currency | 0104 relabels mismatched limit rows to the category's currency, inside the lifted-RLS window, before any currency change exists. Dev had 0 such rows. |

Not fixed (Info, 14-REVIEW.md): IN-01 stale `fx_rate` in the list DTO, IN-02 dead loader dep, IN-03 adjustment date in UTC, IN-04 `as never` route deps.
