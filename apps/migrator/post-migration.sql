-- D-18: app + worker + migrator roles must NOT bypass RLS.
-- Roles are CREATEd by infra (docker-compose init or production provisioning); we ALTER here.
ALTER ROLE app_role NOBYPASSRLS NOSUPERUSER;
ALTER ROLE worker_role NOBYPASSRLS NOSUPERUSER;
ALTER ROLE migrator NOBYPASSRLS NOSUPERUSER;

-- Schema USAGE grants (D-17). identity + tenancy + shared_kernel + budgeting for app_role + worker_role;
-- comparison reserved for comparison_role (Phase 5).
GRANT USAGE ON SCHEMA identity, tenancy, shared_kernel, budgeting TO app_role, worker_role;
-- comparison schema: app_role + worker_role have NO USAGE (Phase 5 introduces comparison_role).

-- D-23 / ENGR-06: append-only ledger.
REVOKE UPDATE, DELETE ON budgeting.expense_ledger FROM app_role, worker_role;
GRANT SELECT, INSERT ON budgeting.expense_ledger TO app_role, worker_role;

-- Pitfall 6: FORCE RLS on every user-data table. Add new tables here as later plans introduce them.
ALTER TABLE budgeting.expense_ledger FORCE ROW LEVEL SECURITY;
-- (Plans 3, 5, 6 append more ALTER TABLE ... FORCE ROW LEVEL SECURITY statements here.)

-- Pitfall 10: shared_kernel.outbox is INFRASTRUCTURE — RLS is replaced by GRANT-based access control.
-- (Wired in Plan 3 — leave a comment marker for later append.)
-- BEGIN OUTBOX_GRANTS_MARKER
-- END OUTBOX_GRANTS_MARKER

-- Idempotent retries: every statement above is safe to re-run.
