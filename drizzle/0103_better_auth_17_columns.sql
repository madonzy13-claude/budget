-- 0103: better-auth 1.7 checks the Drizzle schema against every field its
-- plugins declare and refuses to sign anyone up while one is missing. The
-- organization plugin declares session.activeOrganizationId and
-- organization.logo; 1.6 silently dropped both. Nullable, never read by the app.
ALTER TABLE identity.sessions ADD COLUMN IF NOT EXISTS active_organization_id text;
--> statement-breakpoint
ALTER TABLE tenancy.budgets ADD COLUMN IF NOT EXISTS logo text;
