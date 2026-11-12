---
quick: 20261112-fx-cache
status: complete
---

# Stored conversions into the budget currency

**Measured** on a copy of the dev DB (largest budget, PLN → EUR), rate lookups per request:

| Request | Before | After |
|---|---|---|
| Wealth chart | ~22,000 fn calls, 1174 ms | 245 lookups, ~140 ms (PLN ~150) |
| Planned / reserve-fit / overspent | ~1,540 fn calls | ~45 lookups |
| Cards | — | 28 lookups + 19 today-rate calls |

**Built**
- Migration 0110: `fx_cache_ccy` + cents on `expense_ledger` and `budget_wealth_snapshots`; `fx_convert_final` (same currency, or the exact rate of the row's day once before yesterday); BEFORE INSERT/UPDATE triggers; AFTER UPDATE OF default_currency on budgets re-stores the budget's rows (0.28 s, largest budget); `fx_cache_fill(budget)`.
- Worker: hourly fx job runs `fillFxCaches()` (first run 21k rows / 2.8 s, then 0.18 s).
- Reads: `ledgerAmountIn` / wealth `snap` take the stored amount when it is in the asked currency, else live. All ledger read sites use it.
- `fxConvert` = `fxApply(fxRate(...))`, the function body inline (3× cheaper); equivalence test vs `budgeting.fx_convert`.
- Overview planned: `month_rate` CTE, one lookup per (month, currency).

**Left live on purpose:** today-rate limit sums (cushion, income-vs-planned: ~30 rows each).

**Tests:** fx-cache 8/8 (insert, edit, currency switch, late rate, today, unknown pair, snapshots, reads use store), fx-convert-fn + equivalence, budgeting files all green alone, api routes/architecture/schema/db 603/0, mcp 165/0, tenant-leak 90/0. Worker: 5 pre-existing failures, same without the change.
