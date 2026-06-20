-- 0035: drop the stale unconditional default_currency immutability trigger.
-- The transaction-aware currency lock (D-04/TENT-11) is enforced in the app layer
-- (budget-identity route guard via workspaceRepo.hasTransactions). The old trigger
-- blocked ALL changes incl. zero-transaction budgets — see quick-260613-nkb.
DROP TRIGGER IF EXISTS budgets_currency_immutable ON tenancy.budgets;
DROP FUNCTION IF EXISTS tenancy.budgets_block_currency_change();
