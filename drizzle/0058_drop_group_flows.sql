-- r36 rollback: the investment group P/L flow-ledger (deposit/withdrawal realized
-- gains, added in 0054, pruned in 0057) was removed — too complex for users to
-- reason about. Group P/L is back to current-state only (Σvalue − Σcost). Drop the
-- now-unused table; nothing reads or writes it anymore.

DROP TABLE IF EXISTS budgeting.investment_group_flows;
