-- D-18: NOBYPASSRLS enforced at role creation time in infra/postgres/init/00-roles.sh.
-- ALTER ROLE removed from here — migrator role is NOSUPERUSER and cannot ALTER ROLEs.
-- Roles are created with NOBYPASSRLS NOSUPERUSER by the init script (superuser context).

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

-- Plan 05: BEFORE INSERT triggers on identity tables.
-- Problem: Better Auth does INSERT ... RETURNING but app.current_user_id GUC is not set.
-- With FORCE RLS, RETURNING SELECT applies users_self_visible USING (id = GUC). Without GUC,
-- RETURNING raises 42501 instead of returning 0 rows. Fix: set the GUC transaction-locally
-- so the RETURNING clause sees the new row. Each trigger sets the user context before insert.
CREATE OR REPLACE FUNCTION identity.users_set_context_on_insert() RETURNS trigger AS $$
BEGIN
  PERFORM set_config('app.current_user_id', NEW.id::text, true);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS users_insert_set_context ON identity.users;
CREATE TRIGGER users_insert_set_context
  BEFORE INSERT ON identity.users
  FOR EACH ROW EXECUTE FUNCTION identity.users_set_context_on_insert();

CREATE OR REPLACE FUNCTION identity.accounts_set_context_on_insert() RETURNS trigger AS $$
BEGIN
  PERFORM set_config('app.current_user_id', NEW.user_id::text, true);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS accounts_insert_set_context ON identity.accounts;
CREATE TRIGGER accounts_insert_set_context
  BEFORE INSERT ON identity.accounts
  FOR EACH ROW EXECUTE FUNCTION identity.accounts_set_context_on_insert();

CREATE OR REPLACE FUNCTION identity.sessions_set_context_on_insert() RETURNS trigger AS $$
BEGIN
  PERFORM set_config('app.current_user_id', NEW.user_id::text, true);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sessions_insert_set_context ON identity.sessions;
CREATE TRIGGER sessions_insert_set_context
  BEFORE INSERT ON identity.sessions
  FOR EACH ROW EXECUTE FUNCTION identity.sessions_set_context_on_insert();

-- Plan 1 follow-up: enforce case-insensitive email uniqueness on identity.users.
-- Better Auth's pre-INSERT duplicate check (findOne) returns null because RLS
-- hides existing rows when no app.current_user_id GUC is set during sign-up,
-- so the only canonical guard against duplicate accounts is a DB-level UNIQUE.
-- Idempotent (IF NOT EXISTS) so re-runs are safe.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq
  ON identity.users (lower(email));

-- Plan 1 follow-up: relax SELECT on identity.users for pre-auth lookups.
-- Better Auth's sign-in / pre-INSERT duplicate check / verify flow all run with
-- no app.current_user_id GUC (the user isn't authenticated yet). With strict
-- self-visible policy, every lookup returned 0 rows — sign-in always failed
-- with INVALID_EMAIL_OR_PASSWORD even for valid users.
--
-- Phase 1 trade-off (per CLAUDE.md tech stack + D-16):
--   * Plain `email`/`name` text columns are kept solely for Better Auth compatibility.
--   * The canonical PII at rest is `email_encrypted`/`name_encrypted` (crypto-shredded
--     via per-user DEKs in shared_kernel.user_keys). Reading the plain columns leaks
--     no more than the email_hash unique index already does.
--   * Phase 6 drops the plain columns and routes lookups exclusively via email_hash —
--     at that point this policy can be re-tightened.
--
-- Effect: SELECT works without GUC; UPDATE/DELETE still require matching id.
-- INSERT is governed by users_insert_open (already permissive for app_role/worker_role).
DROP POLICY IF EXISTS users_self_visible ON identity.users;
DROP POLICY IF EXISTS users_self_select ON identity.users;
DROP POLICY IF EXISTS users_self_modify ON identity.users;
DROP POLICY IF EXISTS users_self_delete ON identity.users;
CREATE POLICY users_self_select ON identity.users
  FOR SELECT TO app_role, worker_role
  USING (true);
-- UPDATE is also permissive in Phase 1: Better Auth's verify-email handler
-- updates `email_verified` with no app.current_user_id set (the user isn't
-- authenticated yet). Trigger-based GUC injection cannot help because
-- USING is evaluated *before* BEFORE-row triggers fire. Same Phase 1
-- trade-off as SELECT — re-tightened in Phase 6 once plain email/name
-- are removed.
CREATE POLICY users_self_modify ON identity.users
  FOR UPDATE TO app_role, worker_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY users_self_delete ON identity.users
  FOR DELETE TO app_role, worker_role
  USING (id = (NULLIF(current_setting('app.current_user_id', true), ''))::uuid);

-- identity.sessions: same Phase 1 trade-off. Better Auth's getSession reads the
-- sessions table to validate the cookie BEFORE app.current_user_id can be set
-- (the session lookup IS the authentication step). With strict self-visible
-- policy every getSession returned 0 rows, so authMiddleware always set
-- session=null and every protected endpoint returned 401.
--
-- Reading a session row only exposes the bearer's own already-issued token; if
-- an attacker has the token cookie they're already authenticated. UPDATE/DELETE
-- still require matching user_id GUC.
DROP POLICY IF EXISTS sessions_owner_only ON identity.sessions;
DROP POLICY IF EXISTS sessions_owner_select ON identity.sessions;
DROP POLICY IF EXISTS sessions_owner_modify ON identity.sessions;
DROP POLICY IF EXISTS sessions_owner_delete ON identity.sessions;
CREATE POLICY sessions_owner_select ON identity.sessions
  FOR SELECT TO app_role, worker_role
  USING (true);
CREATE POLICY sessions_owner_modify ON identity.sessions
  FOR UPDATE TO app_role, worker_role
  USING (user_id = (NULLIF(current_setting('app.current_user_id', true), ''))::uuid)
  WITH CHECK (user_id = (NULLIF(current_setting('app.current_user_id', true), ''))::uuid);
CREATE POLICY sessions_owner_delete ON identity.sessions
  FOR DELETE TO app_role, worker_role
  USING (user_id = (NULLIF(current_setting('app.current_user_id', true), ''))::uuid);

-- identity.accounts: same Phase 1 trade-off. Better Auth reads accounts during
-- sign-in to verify the password hash; runs without GUC. The provider/account_id
-- columns are not PII; password column is hashed (argon2/bcrypt).
DROP POLICY IF EXISTS accounts_owner_only ON identity.accounts;
DROP POLICY IF EXISTS accounts_owner_select ON identity.accounts;
DROP POLICY IF EXISTS accounts_owner_modify ON identity.accounts;
DROP POLICY IF EXISTS accounts_owner_delete ON identity.accounts;
CREATE POLICY accounts_owner_select ON identity.accounts
  FOR SELECT TO app_role, worker_role
  USING (true);
CREATE POLICY accounts_owner_modify ON identity.accounts
  FOR UPDATE TO app_role, worker_role
  USING (user_id = (NULLIF(current_setting('app.current_user_id', true), ''))::uuid)
  WITH CHECK (user_id = (NULLIF(current_setting('app.current_user_id', true), ''))::uuid);
CREATE POLICY accounts_owner_delete ON identity.accounts
  FOR DELETE TO app_role, worker_role
  USING (user_id = (NULLIF(current_setting('app.current_user_id', true), ''))::uuid);

-- Plan 02-03: idempotency_keys (two-policy RLS — no separate cleanup role)
-- Policy 1 (idempotency_keys_tenant_isolation) is declared in Drizzle schema (pgPolicy).
-- Policy 2 (idempotency_keys_cleanup) is declared in Drizzle schema (pgPolicy).
-- GRANTs: SELECT + INSERT for app_role + worker_role (request handling);
--         UPDATE required for SELECT ... FOR UPDATE row locking (race-safety T-2-03-03);
--         DELETE for cleanup job via idempotency_keys_cleanup policy.
-- Note: UPDATE grant is needed for SELECT FOR UPDATE lock — rows remain logically
--       write-once (no application code issues UPDATE statements on this table).
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_kernel.idempotency_keys TO app_role, worker_role;
ALTER TABLE shared_kernel.idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at_idx
  ON shared_kernel.idempotency_keys (expires_at);

-- Idempotent retries: every statement above is safe to re-run.

-- Plan 06: tenancy schema (v1.1: workspaces→budgets, workspace_members→budget_members, etc.)
GRANT USAGE ON SCHEMA tenancy TO app_role, worker_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.budgets, tenancy.budget_members, tenancy.budget_invitations TO app_role;
GRANT SELECT ON tenancy.budgets, tenancy.budget_members TO worker_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.shared_budget_member_shares TO app_role;
GRANT SELECT ON tenancy.shared_budget_member_shares TO worker_role;

ALTER TABLE tenancy.budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.budget_members FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.shared_budget_member_shares FORCE ROW LEVEL SECURITY;
-- budget_invitations: token-keyed lookup; NO RLS (status column controls visibility).

-- Phase 6 (ONBD-07): onboarding_progress — USER-SCOPED (app.current_user_id), FORCE RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.onboarding_progress TO app_role;
GRANT SELECT ON tenancy.onboarding_progress TO worker_role;
ALTER TABLE tenancy.onboarding_progress FORCE ROW LEVEL SECURITY;

-- Plan 1 follow-up: budget creation runs through Better Auth's createOrganization,
-- which inserts into tenancy.budgets and tenancy.budget_members BEFORE we can set
-- the app.tenant_ids GUC for the new budget (the row doesn't exist yet, so there is
-- no tenant id to inject). The default tenant_isolation policy's WITH CHECK denies the
-- INSERT.
--
-- Mitigations:
--   * SELECT/UPDATE/DELETE remain gated by the original tenant_isolation policy.
--   * budget_members has a BEFORE INSERT trigger (PC-11) that enforces the PRIVATE
--     1-member cap atomically.
--   * The application service / org-plugin hooks set app.tenant_ids in the same
--     transaction for any subsequent reads.
-- v1.1: drop old workspaces_* policies retained by Postgres RENAME on tenancy.budgets
DROP POLICY IF EXISTS workspaces_insert_open ON tenancy.budgets;
DROP POLICY IF EXISTS workspaces_select_open ON tenancy.budgets;
DROP POLICY IF EXISTS workspaces_tenant_isolation ON tenancy.budgets;
DROP POLICY IF EXISTS workspaces_tenant_update ON tenancy.budgets;
DROP POLICY IF EXISTS workspaces_tenant_delete ON tenancy.budgets;
-- v1.1: drop old workspace_members_* policies on tenancy.budget_members
DROP POLICY IF EXISTS workspace_members_insert_open ON tenancy.budget_members;
DROP POLICY IF EXISTS workspace_members_select_open ON tenancy.budget_members;
DROP POLICY IF EXISTS workspace_members_self ON tenancy.budget_members;
DROP POLICY IF EXISTS workspace_members_tenant_isolation ON tenancy.budget_members;
DROP POLICY IF EXISTS workspace_members_tenant_update ON tenancy.budget_members;
DROP POLICY IF EXISTS workspace_members_tenant_delete ON tenancy.budget_members;

DROP POLICY IF EXISTS budgets_insert_open ON tenancy.budgets;
CREATE POLICY budgets_insert_open ON tenancy.budgets
  FOR INSERT TO app_role, worker_role
  WITH CHECK (true);

DROP POLICY IF EXISTS budget_members_insert_open ON tenancy.budget_members;
CREATE POLICY budget_members_insert_open ON tenancy.budget_members
  FOR INSERT TO app_role, worker_role
  WITH CHECK (true);

-- Better Auth's drizzleAdapter executes every INSERT as `INSERT ... RETURNING *`.
-- Postgres applies SELECT USING to the RETURNING projection — without a permissive
-- SELECT policy, RETURNING reports back zero rows and Better Auth surfaces
-- "new row violates row-level security policy". The original `budgets_tenant_isolation`
-- USING relies on `app.tenant_ids`, which cannot be set BEFORE the budget exists.
--
-- Phase 1 trade-off (matches identity.users / sessions / accounts relaxation):
--   * SELECT on budgets / budget_members is now permissive at the row-security
--     layer — the application-layer repos (budget-repo, member-repo) still filter
--     by membership join, so listing the user's budgets continues to enforce isolation.
--   * UPDATE/DELETE remain gated by the original tenant_isolation policy.
--   * INSERT is permissive (above) so Better Auth's createOrganization succeeds.
--   * Phase 6 routes budget lookups through a tenant-aware adapter that sets
--     app.tenant_ids before the SELECT and re-tightens this policy.
-- Tight SELECT policies: visible only when the requester has set either
-- (a) app.tenant_ids covering the row's budget_id (normal read path),
-- or (b) app.current_user_id matching the row's owner / member user (so
-- Better Auth's INSERT...RETURNING can read its own freshly-inserted row
-- without a tenant context that doesn't yet exist). The sibling BEFORE INSERT
-- trigger below SET LOCAL app.current_user_id from the new row so the
-- RETURNING projection clears the SELECT USING gate.
DROP POLICY IF EXISTS budgets_select_open ON tenancy.budgets;
CREATE POLICY budgets_select_open ON tenancy.budgets
  FOR SELECT TO app_role, worker_role
  USING (
    id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])
    OR owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS budget_members_select_open ON tenancy.budget_members;
CREATE POLICY budget_members_select_open ON tenancy.budget_members
  FOR SELECT TO app_role, worker_role
  USING (
    budget_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])
    OR user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

-- PC-01: bootstrap-self policy (needed for tenant-guard before app.tenant_ids is set)
DROP POLICY IF EXISTS budget_members_self ON tenancy.budget_members;
CREATE POLICY budget_members_self ON tenancy.budget_members
  FOR SELECT TO app_role, worker_role
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- BEFORE INSERT trigger to inject the owner's user-id GUC for the lifetime
-- of the implicit transaction created by Better Auth's INSERT...RETURNING.
-- The SELECT USING policies above use this GUC to authorise the RETURNING
-- projection without leaking other rows.
CREATE OR REPLACE FUNCTION tenancy.budgets_set_user_context_on_insert()
RETURNS trigger AS $$
BEGIN
  PERFORM set_config('app.current_user_id', NEW.owner_user_id::text, true);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS budgets_insert_set_context ON tenancy.budgets;
CREATE TRIGGER budgets_insert_set_context
  BEFORE INSERT ON tenancy.budgets
  FOR EACH ROW EXECUTE FUNCTION tenancy.budgets_set_user_context_on_insert();

CREATE OR REPLACE FUNCTION tenancy.budget_members_set_user_context_on_insert()
RETURNS trigger AS $$
BEGIN
  PERFORM set_config('app.current_user_id', NEW.user_id::text, true);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS budget_members_insert_set_context ON tenancy.budget_members;
CREATE TRIGGER budget_members_insert_set_context
  BEFORE INSERT ON tenancy.budget_members
  FOR EACH ROW EXECUTE FUNCTION tenancy.budget_members_set_user_context_on_insert();

-- Replace the original FOR ALL tenant_isolation policy with split UPDATE / DELETE
-- policies. The FOR ALL policy includes INSERT in its WITH CHECK which kills
-- the budgets_insert_open OR-merge in some Postgres edge cases (FORCE RLS
-- + RETURNING + multiple permissive policies); splitting keeps INSERT
-- governed only by budgets_insert_open and SELECT only by budgets_select_open.
DROP POLICY IF EXISTS budgets_tenant_isolation ON tenancy.budgets;
DROP POLICY IF EXISTS budgets_tenant_update ON tenancy.budgets;
DROP POLICY IF EXISTS budgets_tenant_delete ON tenancy.budgets;
CREATE POLICY budgets_tenant_update ON tenancy.budgets
  FOR UPDATE TO app_role, worker_role
  USING (id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
CREATE POLICY budgets_tenant_delete ON tenancy.budgets
  FOR DELETE TO app_role, worker_role
  USING (id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

DROP POLICY IF EXISTS budget_members_tenant_isolation ON tenancy.budget_members;
DROP POLICY IF EXISTS budget_members_tenant_update ON tenancy.budget_members;
DROP POLICY IF EXISTS budget_members_tenant_delete ON tenancy.budget_members;
CREATE POLICY budget_members_tenant_update ON tenancy.budget_members
  FOR UPDATE TO app_role, worker_role
  USING (budget_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (budget_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
CREATE POLICY budget_members_tenant_delete ON tenancy.budget_members
  FOR DELETE TO app_role, worker_role
  USING (budget_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

-- Plan 02-02: fx_rates reference table (no RLS, GRANT-restricted)
GRANT SELECT ON budgeting.fx_rates TO app_role, worker_role;
GRANT INSERT, UPDATE ON budgeting.fx_rates TO worker_role;

-- Plan 02-02: supported_currencies reference table (no RLS, GRANT-restricted)
GRANT SELECT ON budgeting.supported_currencies TO app_role, worker_role;
GRANT INSERT, UPDATE ON budgeting.supported_currencies TO worker_role;

-- Plan 02-02: seed supported_currencies with 8 fiat + 6 crypto (idempotent)
INSERT INTO budgeting.supported_currencies (iso_code, iso_numeric, name, symbol, kind, provider)
VALUES
  ('USD', 840, 'US Dollar', '$', 'FIAT', 'frankfurter-stub'),
  ('EUR', 978, 'Euro', '€', 'FIAT', 'frankfurter-stub'),
  ('PLN', 985, 'Polish Złoty', 'zł', 'FIAT', 'frankfurter-stub'),
  ('UAH', 980, 'Ukrainian Hryvnia', '₴', 'FIAT', 'frankfurter-stub'),
  ('GBP', 826, 'British Pound', '£', 'FIAT', 'frankfurter-stub'),
  ('CHF', 756, 'Swiss Franc', 'Fr', 'FIAT', 'frankfurter-stub'),
  ('JPY', 392, 'Japanese Yen', '¥', 'FIAT', 'frankfurter-stub'),
  ('NOK', 578, 'Norwegian Krone', 'kr', 'FIAT', 'frankfurter-stub'),
  ('BTC', NULL, 'Bitcoin', '₿', 'CRYPTO', 'internal'),
  ('ETH', NULL, 'Ethereum', 'Ξ', 'CRYPTO', 'internal'),
  ('USDT', NULL, 'Tether', 'USDT', 'CRYPTO', 'internal'),
  ('USDC', NULL, 'USD Coin', 'USDC', 'CRYPTO', 'internal'),
  ('BNB', NULL, 'Binance Coin', 'BNB', 'CRYPTO', 'internal'),
  ('SOL', NULL, 'Solana', 'SOL', 'CRYPTO', 'internal')
ON CONFLICT (iso_code) DO NOTHING;

-- Plan 02-04: wallets (renamed from accounts in v1.1)
-- account_balance_adjustments was dropped in migration 0013 (D-PH2-09); guard with IF EXISTS.
ALTER TABLE budgeting.wallets FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='budgeting' AND table_name='account_balance_adjustments') THEN
    EXECUTE 'ALTER TABLE budgeting.account_balance_adjustments FORCE ROW LEVEL SECURITY';
    EXECUTE 'GRANT SELECT, INSERT ON budgeting.account_balance_adjustments TO app_role, worker_role';
    EXECUTE 'REVOKE UPDATE, DELETE ON budgeting.account_balance_adjustments FROM app_role, worker_role';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.wallets TO app_role, worker_role;

-- v1.1: drop old accounts_* policies on wallets (retained by Postgres RENAME; replaced below)
DROP POLICY IF EXISTS accounts_tenant_isolation ON budgeting.wallets;
DROP POLICY IF EXISTS accounts_worker_cron_scan ON budgeting.wallets;
DROP POLICY IF EXISTS wallets_tenant_isolation ON budgeting.wallets;
CREATE POLICY wallets_tenant_isolation ON budgeting.wallets
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

-- Plan 02-09: cron scan policy — worker_role can SELECT budgeting.wallets across ALL tenants
-- WITHOUT app.tenant_ids set (so the budgeting-reconciliation engine's withInfraTx
-- "SELECT DISTINCT tenant_id FROM budgeting.wallets" scan works). Per-tenant withTenantTx
-- is still required for INSERT/UPDATE/DELETE because permissive policies OR-combine but the
-- worker writes only happen inside withTenantTx(tenantId, SYSTEM_USER) where app.tenant_ids
-- is set. Mirrors recurring_rules_worker_cron_scan (Plan 02-08).
DROP POLICY IF EXISTS wallets_worker_cron_scan ON budgeting.wallets;
CREATE POLICY wallets_worker_cron_scan ON budgeting.wallets
  AS PERMISSIVE FOR SELECT TO worker_role
  USING (true);

-- D-04 / TENT-11: default_currency immutable post-create.
CREATE OR REPLACE FUNCTION tenancy.budgets_block_currency_change() RETURNS trigger AS $$
BEGIN
  IF NEW.default_currency IS DISTINCT FROM OLD.default_currency THEN
    RAISE EXCEPTION 'default_currency is immutable post-create (TENT-11, D-04)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS budgets_currency_immutable ON tenancy.budgets;
CREATE TRIGGER budgets_currency_immutable
  BEFORE UPDATE ON tenancy.budgets
  FOR EACH ROW EXECUTE FUNCTION tenancy.budgets_block_currency_change();

-- PC-11 (TENT-10, D-02): TOCTOU race-free PRIVATE-cap guard. Postgres unique partial indexes
-- cannot reference subqueries, so we use a BEFORE INSERT trigger that runs in the same tx
-- as the INSERT — count read + insert decision are atomic from any concurrent transaction's
-- perspective (row-level lock on budgets.id picked up by SELECT FOR KEY SHARE).
CREATE OR REPLACE FUNCTION tenancy.budget_members_private_guard() RETURNS trigger AS $$
DECLARE
  ws_kind text;
  live_count int;
BEGIN
  SELECT kind INTO ws_kind FROM tenancy.budgets WHERE id = NEW.budget_id FOR KEY SHARE;
  IF ws_kind = 'PRIVATE' THEN
    SELECT count(*)::int INTO live_count FROM tenancy.budget_members WHERE budget_id = NEW.budget_id;
    IF live_count >= 1 THEN
      RAISE EXCEPTION 'PRIVATE budgets accept only the owner. Convert to SHARED first. (TENT-10, D-02, PC-11)';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS budget_members_private_cap ON tenancy.budget_members;
CREATE TRIGGER budget_members_private_cap
  BEFORE INSERT ON tenancy.budget_members
  FOR EACH ROW EXECUTE FUNCTION tenancy.budget_members_private_guard();

-- D-06 / TENT-13: shares sum = 100 per budget, deferred constraint trigger.
CREATE OR REPLACE FUNCTION tenancy.shares_sum_check() RETURNS trigger AS $$
DECLARE total numeric(7,2);
BEGIN
  SELECT coalesce(sum(percentage), 0) INTO total
  FROM tenancy.shared_budget_member_shares
  WHERE budget_id = COALESCE(NEW.budget_id, OLD.budget_id);
  IF abs(total - 100) > 0.005 AND total > 0 THEN
    RAISE EXCEPTION 'shared_budget_member_shares for budget % must sum to 100 (got %)', COALESCE(NEW.budget_id, OLD.budget_id), total;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS shares_sum_invariant ON tenancy.shared_budget_member_shares;
CREATE CONSTRAINT TRIGGER shares_sum_invariant
  AFTER INSERT OR UPDATE OR DELETE ON tenancy.shared_budget_member_shares
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tenancy.shares_sum_check();
-- Note: total > 0 short-circuit allows the freshly-created budget state where no rows exist (sum=0)
-- and the subsequent owner-edit transaction filling rows to balance to 100 within the same tx.

-- ===== Plan 02-05: categories + limits + templates + share overrides + mode history =====
ALTER TABLE budgeting.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.category_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.budget_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.budget_template_items FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.category_share_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.budget_mode_history FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  budgeting.categories,
  budgeting.category_limits,
  budgeting.budget_templates,
  budgeting.budget_template_items,
  budgeting.category_share_overrides,
  budgeting.budget_mode_history
  TO app_role, worker_role;

-- One-level grouping trigger (BDGT-02)
CREATE OR REPLACE FUNCTION budgeting.categories_one_level_check() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM budgeting.categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Categories support only one level of grouping';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS categories_one_level_trigger ON budgeting.categories;
CREATE TRIGGER categories_one_level_trigger
  BEFORE INSERT OR UPDATE ON budgeting.categories
  FOR EACH ROW EXECUTE FUNCTION budgeting.categories_one_level_check();

-- Categories are flat and unique per workspace by name (case-insensitive).
-- Partial: archived categories don't block creating a new one with the same name.
CREATE UNIQUE INDEX IF NOT EXISTS categories_unique_name_per_tenant
  ON budgeting.categories (tenant_id, lower(name)) WHERE archived_at IS NULL;

-- Partial unique + PIT indexes (effective-dated)
CREATE UNIQUE INDEX IF NOT EXISTS category_limits_one_open_per_cat
  ON budgeting.category_limits (category_id) WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS category_limits_pit_idx
  ON budgeting.category_limits (category_id, effective_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS budget_mode_one_open
  ON budgeting.budget_mode_history (budget_id) WHERE effective_to IS NULL;

-- BDGT-08 sum-to-100 deferred trigger
CREATE OR REPLACE FUNCTION budgeting.category_share_overrides_sum_check() RETURNS trigger AS $$
DECLARE total numeric(7,4); cat_id uuid;
BEGIN
  cat_id := COALESCE(NEW.category_id, OLD.category_id);
  SELECT coalesce(sum(percentage), 0) INTO total
    FROM budgeting.category_share_overrides WHERE category_id = cat_id;
  IF abs(total - 100) > 0.005 AND total > 0 THEN
    RAISE EXCEPTION 'category_share_overrides for category % must sum to 100 (got %)', cat_id, total;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS category_shares_sum_invariant ON budgeting.category_share_overrides;
CREATE CONSTRAINT TRIGGER category_shares_sum_invariant
  AFTER INSERT OR UPDATE OR DELETE ON budgeting.category_share_overrides
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION budgeting.category_share_overrides_sum_check();

-- D-02-c budget_share_dirty flag table + member join/leave triggers
-- (renamed from workspace_share_dirty in v1.1 migration 0012)
CREATE TABLE IF NOT EXISTS budgeting.budget_share_dirty (
  budget_id UUID PRIMARY KEY,
  dirty BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE budgeting.budget_share_dirty FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_share_dirty_isolation ON budgeting.budget_share_dirty;
CREATE POLICY budget_share_dirty_isolation ON budgeting.budget_share_dirty
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (budget_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (budget_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
GRANT SELECT, INSERT, UPDATE ON budgeting.budget_share_dirty TO app_role, worker_role;

CREATE OR REPLACE FUNCTION budgeting.flag_budget_share_dirty() RETURNS trigger AS $$
DECLARE
  ws_kind text;
BEGIN
  -- D-02-c only applies to SHARED budgets. PRIVATE budgets have a single
  -- member; share validation is irrelevant — skip the dirty flag entirely.
  SELECT kind::text INTO ws_kind FROM tenancy.budgets
   WHERE id = COALESCE(NEW.budget_id, OLD.budget_id);

  IF ws_kind <> 'PRIVATE' THEN
    INSERT INTO budgeting.budget_share_dirty (budget_id, dirty, updated_at)
    VALUES (COALESCE(NEW.budget_id, OLD.budget_id), true, now())
    ON CONFLICT (budget_id) DO UPDATE SET dirty = true, updated_at = now();
  END IF;

  -- Pitfall 8: cascade delete overrides for departing user
  IF TG_OP = 'DELETE' THEN
    DELETE FROM budgeting.category_share_overrides
     WHERE user_id = OLD.user_id
       AND category_id IN (SELECT id FROM budgeting.categories WHERE tenant_id = OLD.budget_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

-- One-time backfill: clear dirty flag for any existing PRIVATE budgets that
-- were marked dirty by the prior trigger logic. Idempotent.
UPDATE budgeting.budget_share_dirty bsd SET dirty = false
  FROM tenancy.budgets b
 WHERE b.id = bsd.budget_id
   AND b.kind = 'PRIVATE'
   AND bsd.dirty = true;
DROP TRIGGER IF EXISTS budget_members_share_dirty ON tenancy.budget_members;
CREATE TRIGGER budget_members_share_dirty
  AFTER INSERT OR DELETE ON tenancy.budget_members
  FOR EACH ROW EXECUTE FUNCTION budgeting.flag_budget_share_dirty();

-- ===== Plan 02-06: expense_ledger Phase-2 extensions (idempotent — safe to re-run) =====

-- Drop corrected_by_id (D-05-a) — Drizzle push should handle; belt-and-suspenders here
ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS corrected_by_id;

-- Add Phase-2 columns if not already present (drizzle-kit push does this; SQL is belt-and-suspenders)
-- Note: account_id and kind are NOT added here — they were dropped in v1.1 migration 0012 (MIG-03).
-- wallet_id is added in v1.1 (Plan 01-03 fix) to preserve wallet reference for balance correction flow.
ALTER TABLE budgeting.expense_ledger
  ADD COLUMN IF NOT EXISTS transaction_date date NOT NULL DEFAULT now()::date,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_group_id uuid,
  ADD COLUMN IF NOT EXISTS wallet_id uuid;

-- note_tsv: GENERATED ALWAYS AS STORED (Drizzle cannot express this — SQL only)
-- We must drop and re-add if column exists but is not generated (idempotent via IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'budgeting'
       AND table_name = 'expense_ledger'
       AND column_name = 'note_tsv'
       AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS note_tsv;
    ALTER TABLE budgeting.expense_ledger
      ADD COLUMN note_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('simple', coalesce(note, ''))) STORED;
  END IF;
END $$;

-- CHECK constraint on kind: dropped in v1.1 (kind column removed in MIG-03).
-- Belt-and-suspenders: drop if somehow still present from an older migration replay.
ALTER TABLE budgeting.expense_ledger DROP CONSTRAINT IF EXISTS expense_ledger_kind_chk;

-- Indexes (all IF NOT EXISTS — idempotent)
CREATE INDEX IF NOT EXISTS expense_ledger_note_tsv_idx
  ON budgeting.expense_ledger USING GIN (note_tsv);
-- corrects_id dropped in migration 0013 (A16) — index skipped.
-- transfer_group_id dropped in migration 0013 (A16) — index skipped.
CREATE INDEX IF NOT EXISTS expense_ledger_tenant_date_idx
  ON budgeting.expense_ledger (tenant_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS expense_ledger_tenant_category_date_idx
  ON budgeting.expense_ledger (tenant_id, category_id, transaction_date DESC);
-- expense_ledger_tenant_account_date_idx: account_id dropped in v1.1 (MIG-03); index not created.

-- Re-assert REVOKE (safe after Drizzle push which may GRANT more broadly)
REVOKE UPDATE, DELETE ON budgeting.expense_ledger FROM app_role, worker_role;
GRANT SELECT, INSERT ON budgeting.expense_ledger TO app_role, worker_role;

-- spending_by_category_month table (ENGR-14 projection) — Drizzle push creates it
ALTER TABLE budgeting.spending_by_category_month FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spending_projection_isolation ON budgeting.spending_by_category_month;
CREATE POLICY spending_projection_isolation ON budgeting.spending_by_category_month
  AS PERMISSIVE FOR ALL
  TO app_role, worker_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
GRANT SELECT, INSERT, UPDATE ON budgeting.spending_by_category_month TO app_role, worker_role;
-- Plan 02-09: replay CLI + reconciliation worker rebuild projection rows; DELETE
-- needed for replay's DELETE+INSERT atomic rebuild. Granted to BOTH roles since the
-- reconciliation cron runs under app_role inside withTenantTx(SYSTEM_USER) — same
-- pattern as recurring_rules above. Auto-repair path uses UPSERT (INSERT ... ON CONFLICT).
GRANT DELETE ON budgeting.spending_by_category_month TO app_role, worker_role;

-- ===== Plan 02-08: recurring_rules + recurring_drafts + system_user seed =====

-- ENABLE + FORCE RLS on new tables (ENABLE done by Drizzle migration; FORCE done here)
ALTER TABLE budgeting.recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgeting.recurring_rules FORCE ROW LEVEL SECURITY;
-- recurring_drafts was dropped in migration 0013 (Section C — folded into expense_ledger); guard with IF EXISTS.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='budgeting' AND table_name='recurring_drafts') THEN
    EXECUTE 'ALTER TABLE budgeting.recurring_drafts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE budgeting.recurring_drafts FORCE ROW LEVEL SECURITY';
    EXECUTE $sql$DROP POLICY IF EXISTS recurring_drafts_tenant_isolation ON budgeting.recurring_drafts$sql$;
    EXECUTE $sql$CREATE POLICY recurring_drafts_tenant_isolation ON budgeting.recurring_drafts
      AS PERMISSIVE FOR ALL TO app_role, worker_role
      USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
      WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))$sql$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.recurring_drafts TO app_role, worker_role';
  END IF;
END $$;

-- RLS policies (idempotent — DROP IF EXISTS + re-CREATE)
DROP POLICY IF EXISTS recurring_rules_tenant_isolation ON budgeting.recurring_rules;
CREATE POLICY recurring_rules_tenant_isolation ON budgeting.recurring_rules
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.recurring_rules TO app_role, worker_role;

-- D-05-g system user for cron-initiated writes (recurring engine, projection reconciliation)
-- NOTE: identity.users has FORCE ROW LEVEL SECURITY and only app_role/worker_role have INSERT policies.
-- The migrator (table owner) cannot insert directly due to FORCE RLS. The system user is seeded
-- via the Docker init SQL (runs as postgres superuser) in infra/postgres/init/.
-- In dev, run manually: docker exec budget-db-1 psql -U postgres -d budget -c "
--   INSERT INTO identity.users (id,email,email_verified,name,locale,display_currency,created_at,updated_at)
--   VALUES ('00000000-0000-0000-0000-000000000001','system@budget.local',true,'System','en','USD',now(),now())
--   ON CONFLICT (id) DO NOTHING;"

-- Indexes for engine scan
CREATE INDEX IF NOT EXISTS recurring_rules_next_due_idx
  ON budgeting.recurring_rules (next_due_date) WHERE active = true;
-- recurring_drafts dropped in migration 0013; indexes skipped.
-- recurring_drafts_pending_idx: skipped (table dropped).
-- recurring_drafts_rule_pending_due_idx: skipped (table dropped).

-- Cron scan policy: worker_role can SELECT recurring_rules across ALL tenants WITHOUT app.tenant_ids
-- set (so the engine's withInfraTx scan-distinct-tenants step works). Per-tenant withTenantTx is
-- still required for INSERTs/UPDATEs into recurring_rules and recurring_drafts (the tenant-isolation
-- policy still applies because policies are PERMISSIVE — combined with OR, but worker writes only
-- happen inside withTenantTx where app.tenant_ids is set, so the tenant-isolation USING + WITH CHECK
-- still gates the actual mutation to the correct tenant).
DROP POLICY IF EXISTS recurring_rules_worker_cron_scan ON budgeting.recurring_rules;
CREATE POLICY recurring_rules_worker_cron_scan ON budgeting.recurring_rules
  AS PERMISSIVE FOR SELECT TO worker_role
  USING (true);

-- ===== Plan 01-01: tasks table (v1.1 new) =====
ALTER TABLE budgeting.tasks FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.tasks TO app_role, worker_role;

-- ===== Phase 2 Plan 02-01: expense_ledger + reserves view + share-links GRANTs/RLS =====

-- Phase 2 v1.1: column-level GRANT UPDATE on editable expense_ledger columns
-- (lifts REVOKE UPDATE for PATCH /transactions; preserves append-only for id/tenant_id/budget_id/created_at)
-- Phase 4 plan 04-02: added dismissed_at (per-occurrence recurring draft dismiss, RECR-06)
GRANT UPDATE (note, transaction_date, category_id, amount_original_cents, currency_original,
              amount_converted_cents, fx_rate, fx_as_of, kind, recurring_rule_id,
              confirmed_at, dismissed_at, deleted_at, updated_at)
  ON budgeting.expense_ledger TO app_role;

-- Phase 2 plan 02-03: GRANT on reserves auto-compute view —
-- REMOVED in Phase 05 reserve rewrite (migration 0030, decision B): the
-- budgeting.category_reserve_balance VIEW was dropped (replay-on-read engine
-- replaces the precomputed-balance VIEW). No grant to re-apply; post-migration.sql
-- runs on every migrate, so referencing the dropped VIEW here errors with 42P01.

-- Phase 5 plan 05-01: category_reserve_adjustments (append-only ledger, D-PH5-R8)
-- FORCE RLS was applied by migration 0020 via ALTER TABLE ... FORCE ROW LEVEL SECURITY.
-- GRANTs: INSERT only for app_role (append-only); SELECT for both roles; no UPDATE/DELETE.
ALTER TABLE budgeting.category_reserve_adjustments FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON budgeting.category_reserve_adjustments TO app_role, worker_role;
REVOKE UPDATE, DELETE ON budgeting.category_reserve_adjustments FROM app_role, worker_role;

-- Phase 2 plan 02-04: budget_share_links GRANTs + RLS
GRANT SELECT, INSERT, UPDATE ON tenancy.budget_share_links TO app_role;
GRANT SELECT ON tenancy.budget_share_links TO worker_role;

ALTER TABLE tenancy.budget_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.budget_share_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_share_links_tenant_isolation ON tenancy.budget_share_links;
CREATE POLICY budget_share_links_tenant_isolation ON tenancy.budget_share_links
  AS PERMISSIVE FOR ALL TO app_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

-- ===== Plan 08-01: push_subscriptions + notification_prefs =====
-- FORCE RLS + GRANTs (migration 0032 creates the tables + policies).
-- Idempotent: IF NOT EXISTS + DROP IF EXISTS guards.
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_kernel.push_subscriptions  TO app_role, worker_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_kernel.notification_prefs TO app_role, worker_role;
ALTER TABLE shared_kernel.push_subscriptions  FORCE ROW LEVEL SECURITY;
ALTER TABLE shared_kernel.notification_prefs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_tenant_isolation  ON shared_kernel.push_subscriptions;
CREATE POLICY push_subscriptions_tenant_isolation ON shared_kernel.push_subscriptions
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING   (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

DROP POLICY IF EXISTS notification_prefs_tenant_isolation ON shared_kernel.notification_prefs;
CREATE POLICY notification_prefs_tenant_isolation ON shared_kernel.notification_prefs
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING   (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
