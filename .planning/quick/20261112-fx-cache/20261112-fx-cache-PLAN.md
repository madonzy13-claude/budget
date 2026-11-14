---
quick: 20261112-fx-cache
type: execute
---

# Stored conversions into the budget currency

**Why:** after a budget currency change, every read converts every old row
through `budgeting.fx_convert` (~60µs/call). Measured on a clone of the dev DB
(PLN → EUR): wealth 152 → 1174 ms, reserve-fit 64 → 278, planned 45 → 219,
overspent 36 → 136.

**What:**
1. Migration 0110: `fx_cache_ccy` + cents columns on `expense_ledger` and
   `budget_wealth_snapshots`; `fx_convert_final` (only a rate that can no
   longer change: exact-date rate, date before yesterday; same currency always);
   BEFORE INSERT/UPDATE triggers fill them in the budget's current currency;
   AFTER UPDATE OF default_currency on budgets refills the budget's rows;
   `fx_cache_fill(budget)` fills rows whose rate became final since.
2. Reads (`ledgerAmountIn`, wealth `snap`) use the stored value when its
   currency is the target, else convert live — stale = slower, never wrong.
   Every ledger read site goes through `ledgerAmountIn`.
3. Worker: hourly fx job calls `fx_cache_fill` per budget after fetching.
4. Tests first (real Postgres): insert, edit, currency switch, late rate,
   today's row, unknown pair, snapshots; reads equal live conversion.
5. Bench on the clone again; full budgeting/api suites; tenant-leak.

Limits (converted at LEAST(month end, today) per month) and today-rate reads
(scheduled, cushion, projection) stay live — measure after 1–3.
