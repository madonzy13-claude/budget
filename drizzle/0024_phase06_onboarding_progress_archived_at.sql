-- Phase 6, Plan 06-01: onboarding_progress table + budgets.archived_at column
-- D-06 / ONBD-07: tracks 5-step wizard progress (one row per user, USER-SCOPED RLS)
-- D-09: soft-delete archived_at on budgets (NULL = active, non-NULL = archived)

-- New column on existing table
ALTER TABLE tenancy.budgets ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- New USER-SCOPED table: onboarding_progress
CREATE TABLE IF NOT EXISTS tenancy.onboarding_progress (
  user_id uuid PRIMARY KEY,
  step integer NOT NULL DEFAULT 1,
  completed_at timestamptz
);

-- RLS policy: owner-only access keyed by app.current_user_id (USER-SCOPED, not tenant-scoped)
ALTER TABLE tenancy.onboarding_progress ENABLE ROW LEVEL SECURITY;
-- FORCE RLS so the table owner (migrator role) also passes through policies.
-- Without FORCE, the migrator connection bypasses all RLS predicates.
-- Co-located here (not only in post-migration.sql) so a manual migration replay is always safe.
ALTER TABLE tenancy.onboarding_progress FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_progress_owner_only ON tenancy.onboarding_progress;
CREATE POLICY onboarding_progress_owner_only ON tenancy.onboarding_progress
  AS PERMISSIVE
  FOR ALL
  TO app_role, worker_role
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
