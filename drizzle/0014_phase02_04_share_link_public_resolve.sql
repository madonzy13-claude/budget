-- Migration: 0014_phase02_04_share_link_public_resolve.sql
--
-- Adds a worker_role policy on tenancy.budget_share_links that allows
-- SELECT by token without requiring tenant context.
--
-- Rationale: The public GET /budgets/join/:token route must look up a link
-- by token alone (recipient has no tenant context yet). The token IS the
-- credential (T-02-05, D-PH2-05). The infrastructure path uses workerDb()
-- (worker_role) via withInfraTx. FORCE RLS applies to all roles; this policy
-- grants worker_role read-only access to resolve tokens publicly.
--
-- Security: worker_role cannot write to this table (only SELECT is granted).
-- The RLS policy for app_role (with tenant isolation) still applies for
-- all tenant-scoped operations (create, revoke, list).
--
-- See: 02-04-PLAN.md STRIDE T-02-08 disposition.

-- Allow worker_role to SELECT share links by token (public resolve path)
DROP POLICY IF EXISTS budget_share_links_worker_public_resolve ON tenancy.budget_share_links;

CREATE POLICY budget_share_links_worker_public_resolve
  ON tenancy.budget_share_links
  AS PERMISSIVE
  FOR SELECT
  TO worker_role
  USING (true);

-- Allow worker_role to SELECT budgets by id (for budget name resolution in public resolve path)
-- budget_tenant_isolation policy requires app.tenant_ids GUC which is not available in the
-- public path. This permissive SELECT policy enables withInfraTx to load the budget name.
DROP POLICY IF EXISTS budgets_worker_public_resolve ON tenancy.budgets;

CREATE POLICY budgets_worker_public_resolve
  ON tenancy.budgets
  AS PERMISSIVE
  FOR SELECT
  TO worker_role
  USING (true);

-- Drop obsolete workspace_* triggers that reference tenancy.workspaces (dropped in 0012)
-- These triggers were NOT dropped by 0013 migration and cause INSERT failures on budget_members.
DROP TRIGGER IF EXISTS workspace_members_insert_set_context ON tenancy.budget_members;
DROP TRIGGER IF EXISTS workspace_members_private_cap ON tenancy.budget_members;
DROP TRIGGER IF EXISTS workspace_members_share_dirty ON tenancy.budget_members;
DROP TRIGGER IF EXISTS workspaces_currency_immutable ON tenancy.budgets;
DROP TRIGGER IF EXISTS workspaces_insert_set_context ON tenancy.budgets;
