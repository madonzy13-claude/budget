-- 0100: an unconfirmed payment set aside to a future date (0099) is converted
-- again at ITS date's rate when the worker brings it back (user, R6). Column
-- grants only — the ledger has no table-wide UPDATE.
GRANT UPDATE (amount_converted_cents, fx_rate, fx_as_of) ON budgeting.expense_ledger TO worker_role;
