-- Store the investments COST BASIS (Σ buy_price × qty, FX→budget ccy) alongside
-- the value in each wealth snapshot, so P/L (value − cost) is trackable over time
-- and the "Excl. contributions" chart never cliffs when cost is derived from the
-- holdings' creation dates. Captured going forward by the 3h cron + live point;
-- existing rows are backfilled to the budget's current cost basis. Nullable —
-- NULL means "not captured" (treated as no cost adjustment on read).
ALTER TABLE budgeting.budget_wealth_snapshots
  ADD COLUMN IF NOT EXISTS investment_cost_basis_cents bigint;
