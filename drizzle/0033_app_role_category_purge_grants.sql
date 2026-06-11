-- 0033: app_role DELETE grants required by category archive + permanent delete.
--
-- Context: commit ccca754 (archive deletes unconfirmed drafts from expense_ledger)
-- and the DELETE /categories/:id permanent-delete endpoint (hardDelete purges
-- expense_ledger + category_reserve_adjustments rows by category) both run as
-- app_role, which only had INSERT/SELECT on these tables. Every archive and
-- permanent delete failed with 42501 permission denied.
--
-- The ledger stays append-only for normal flows: UPDATE remains revoked except
-- the column grant from 0019 (dismissed_at). DELETE is tenant-scoped by the
-- existing RLS policy (expense_ledger_tenant_isolation, FOR ALL).

--> statement-breakpoint
GRANT DELETE ON budgeting.expense_ledger TO app_role;
--> statement-breakpoint
GRANT DELETE ON budgeting.category_reserve_adjustments TO app_role;
