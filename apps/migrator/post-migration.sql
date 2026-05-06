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

-- Plan 03: audit_history
GRANT SELECT, INSERT ON shared_kernel.audit_history TO app_role, worker_role;
ALTER TABLE shared_kernel.audit_history FORCE ROW LEVEL SECURITY;

-- Plan 03: outbox (Pitfall 10 — NO RLS, GRANT-restricted access)
GRANT INSERT ON shared_kernel.outbox TO app_role;
GRANT SELECT, UPDATE ON shared_kernel.outbox TO worker_role;
-- Intentionally no FORCE ROW LEVEL SECURITY on outbox — this is infrastructure, not domain data.

-- Plan 04: user_keys (D-16 — crypto-shredding key store)
-- PC-12: user-scoped (RLS keyed by app.current_user_id), NOT tenant-scoped
GRANT SELECT, INSERT, UPDATE ON shared_kernel.user_keys TO app_role;
GRANT SELECT ON shared_kernel.user_keys TO worker_role;
ALTER TABLE shared_kernel.user_keys FORCE ROW LEVEL SECURITY;

-- Plan 05: identity schema
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.users, identity.sessions, identity.accounts TO app_role;
GRANT SELECT ON identity.users, identity.sessions, identity.accounts TO worker_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.verifications TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.user_preferences TO app_role;
GRANT SELECT ON identity.user_preferences TO worker_role;

ALTER TABLE identity.users FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.user_preferences FORCE ROW LEVEL SECURITY;
-- identity.verifications: NO RLS (token-keyed lookups; token IS the credential).

-- Idempotent retries: every statement above is safe to re-run.
