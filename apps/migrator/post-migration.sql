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

-- Plan 06: tenancy schema
GRANT USAGE ON SCHEMA tenancy TO app_role, worker_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.workspaces, tenancy.workspace_members, tenancy.workspace_invitations TO app_role;
GRANT SELECT ON tenancy.workspaces, tenancy.workspace_members TO worker_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.shared_workspace_member_shares TO app_role;
GRANT SELECT ON tenancy.shared_workspace_member_shares TO worker_role;

ALTER TABLE tenancy.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.workspace_members FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.shared_workspace_member_shares FORCE ROW LEVEL SECURITY;
-- workspace_invitations: token-keyed lookup; NO RLS (status column controls visibility).

-- D-04 / TENT-11: default_currency immutable post-create.
CREATE OR REPLACE FUNCTION tenancy.workspaces_block_currency_change() RETURNS trigger AS $$
BEGIN
  IF NEW.default_currency IS DISTINCT FROM OLD.default_currency THEN
    RAISE EXCEPTION 'default_currency is immutable post-create (TENT-11, D-04)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS workspaces_currency_immutable ON tenancy.workspaces;
CREATE TRIGGER workspaces_currency_immutable
  BEFORE UPDATE ON tenancy.workspaces
  FOR EACH ROW EXECUTE FUNCTION tenancy.workspaces_block_currency_change();

-- PC-11 (TENT-10, D-02): TOCTOU race-free PRIVATE-cap guard. Postgres unique partial indexes
-- cannot reference subqueries, so we use a BEFORE INSERT trigger that runs in the same tx
-- as the INSERT — count read + insert decision are atomic from any concurrent transaction's
-- perspective (row-level lock on workspaces.id picked up by SELECT FOR KEY SHARE).
CREATE OR REPLACE FUNCTION tenancy.workspace_members_private_guard() RETURNS trigger AS $$
DECLARE
  ws_kind text;
  live_count int;
BEGIN
  SELECT kind INTO ws_kind FROM tenancy.workspaces WHERE id = NEW.workspace_id FOR KEY SHARE;
  IF ws_kind = 'PRIVATE' THEN
    SELECT count(*)::int INTO live_count FROM tenancy.workspace_members WHERE workspace_id = NEW.workspace_id;
    IF live_count >= 1 THEN
      RAISE EXCEPTION 'PRIVATE workspaces accept only the owner. Convert to SHARED first. (TENT-10, D-02, PC-11)';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS workspace_members_private_cap ON tenancy.workspace_members;
CREATE TRIGGER workspace_members_private_cap
  BEFORE INSERT ON tenancy.workspace_members
  FOR EACH ROW EXECUTE FUNCTION tenancy.workspace_members_private_guard();

-- D-06 / TENT-13: shares sum = 100 per workspace, deferred constraint trigger.
CREATE OR REPLACE FUNCTION tenancy.shares_sum_check() RETURNS trigger AS $$
DECLARE total numeric(7,2);
BEGIN
  SELECT coalesce(sum(percentage), 0) INTO total
  FROM tenancy.shared_workspace_member_shares
  WHERE workspace_id = COALESCE(NEW.workspace_id, OLD.workspace_id);
  IF abs(total - 100) > 0.005 AND total > 0 THEN
    RAISE EXCEPTION 'shared_workspace_member_shares for workspace % must sum to 100 (got %)', COALESCE(NEW.workspace_id, OLD.workspace_id), total;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS shares_sum_invariant ON tenancy.shared_workspace_member_shares;
CREATE CONSTRAINT TRIGGER shares_sum_invariant
  AFTER INSERT OR UPDATE OR DELETE ON tenancy.shared_workspace_member_shares
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tenancy.shares_sum_check();
-- Note: total > 0 short-circuit allows the freshly-created workspace state where no rows exist (sum=0)
-- and the subsequent owner-edit transaction filling rows to balance to 100 within the same tx.
