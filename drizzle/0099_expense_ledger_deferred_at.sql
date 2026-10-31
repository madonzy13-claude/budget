-- 0099: an unconfirmed scheduled payment moved to a future date (user, R6).
-- It leaves the unconfirmed list (and its confirm task) until that date; the
-- daily scheduled-payment engine clears deferred_at and re-raises the task.
ALTER TABLE budgeting.expense_ledger ADD COLUMN IF NOT EXISTS deferred_at timestamptz;

--> statement-breakpoint
-- Column grants only (the ledger has no table-wide UPDATE): the API sets it,
-- the worker clears it on the payment's date.
GRANT UPDATE (deferred_at) ON budgeting.expense_ledger TO app_role;
--> statement-breakpoint
GRANT UPDATE (deferred_at, updated_at) ON budgeting.expense_ledger TO worker_role;
