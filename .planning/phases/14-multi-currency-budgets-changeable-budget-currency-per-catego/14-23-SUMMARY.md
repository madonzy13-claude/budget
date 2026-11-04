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
| 5 | Reserve rows should name their currency, aligned | Owner follow-ups: left of the amount, then "too far from the amount — do it as in asset wallets". Rows now copy the wallet row geometry: the amount column is sized to the longest amount (+1ch from sm), and the code cell uses the wallet widths. On phone that is the code right-aligned against the number; on desktop code + name + symbol, as the wallet picker reads. Plain text, no dotted underline (not editable). Footer per-currency parts wrap one by one. |

| 6 | (owner, 261104) Pie, "How far off the average limit", "How much each limit should change", "Is each reserve the right size?" and both rebalance dialogs must read a category in ITS currency, with sizes still proportional | Server: overview planned and reserve fit run a second pass with every input in each category's own currency, only when some category is foreign. Limits are as typed, spend is at each row's date, reserves are native, rules convert into the category's currency. Rows carry `currency` + `own` (`own_projected_monthly_cents` on projections). Web: the pie and diverging bars gained `labelKey`; labels and tooltips read `own`, while slices and bars stay sized in the budget currency. Both rebalance dialogs show, propose and save in the category's currency (`amountsCurrency` / adjust `currency` = the category's), so there is no conversion and no drift. Live: a USD budget with a 100 € and a 400 zł limit reads "−€100" / "−400 zł" bars, sorted by USD size. |

## Verification
- Backend: change-category-currency (exact round trip + source exposed), limit-rate-date (+ pie input), category limits / summary / currency routes: all green.
- Web Vitest: slider currency (server source basis, preview-only save skips the limits POST, edited amount still saves), reserves row, i18n keys.
- Backend gate `bun test --timeout 120000 packages apps/api/test tests`: 2356 pass / the same 2 pre-phase baseline fails. The combined run caught two issues isolation hid, both fixed: the demo manifest had no class for `converted_from` (now NULL), and a currency change wanted a rate from the CURRENT currency as well as from the source it converts from.
- Final run after item 6: Vitest 3074 pass / 0 fail; backend gate 2357 pass, with the same 2 baseline fails plus dep-cruiser timing out at 31s under parallel load (passes alone); E2E `@overview|@reserves-multi-currency|@category-currency|@budget-currency-change` 57 passed, 1 flaky (projection divider, mobile). Bench on the real budget (no foreign category, so no second pass): reserve-fit 90ms and planned 72ms median; a foreign category roughly doubles that.
- Earlier: Web Vitest 3069 pass (1 known-flaky investments test passes alone).
- E2E chromium + mobile, phase tags + @overview-rebalance + @phase8 + @reserves-golden: 73 passed, 1 flaky (share-link). The 3 failures were test-side and are fixed: the slider PO waited for a limits POST (skipped by design now), and the golden timeline compared bare "0" to the signed "€0". Rerun of `@category-currency|@reserves-golden`: all pass.
