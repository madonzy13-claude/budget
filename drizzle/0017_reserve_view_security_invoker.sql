-- 02-06 follow-up: budgeting.category_reserve_balance view defaults to
-- security_invoker=false, meaning the view runs as its OWNER (migrator).
-- Migrator's role is NOBYPASSRLS and category_limits / expense_ledger /
-- budget_mode_history are FORCE ROW LEVEL SECURITY. Without app.tenant_ids
-- in the migrator session, every CTE returns zero rows and the view body
-- returns zero rows regardless of the caller's tenant context.
--
-- Set security_invoker=true so the view runs with the caller's role and
-- GUC. app_role + worker_role queries inside withTenantTx already set
-- app.tenant_ids — RLS now reads the correct tenant slice and the view
-- returns per-category reserves as designed (RSCM-01, RSCM-02).
--
-- Idempotent: ALTER VIEW ... SET (security_invoker = true) is safe to
-- re-run; SET is a no-op when the option is already set.

--> statement-breakpoint

ALTER VIEW budgeting.category_reserve_balance SET (security_invoker = true);
