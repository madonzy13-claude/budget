-- 0106: Phase 15 MCP server.
--   * OAuth 2.1 authorization-server tables for @better-auth/oauth-provider 1.7.18
--     + the jwt plugin (columns = the plugins' own schema field lists; ids are
--     text like sessions/accounts, user_id uuid).
--   * shared_kernel.mcp_write_log — hidden record of every MCP write (D-08),
--     feeds agent undo (D-11) and the daily write cap (D-25).
--   * shared_kernel.mcp_import_previews — server-checked import rows (D-15).
-- RLS: token/consent tables are USER-SCOPED with an app.better_auth escape —
-- authorize/token run with no user GUC, and an owner-only policy would silently
-- match 0 rows. Client/resource/assertion/jwks tables hold no user data: no RLS
-- (same posture as identity.verifications). MCP tables are USER-SCOPED because
-- undo and the cap span all of a user's budgets (D-01). Grants live in
-- post-migration.sql.
CREATE TABLE IF NOT EXISTS identity.jwks (
  id text PRIMARY KEY,
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz,
  alg text,
  crv text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity.oauth_client (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  client_secret text,
  client_discovery_id text,
  disabled boolean,
  skip_consent boolean,
  enable_end_session boolean,
  subject_type text,
  scopes text[],
  client_credentials_scopes text[],
  user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  name text,
  uri text,
  icon text,
  contacts text[],
  tos text,
  policy text,
  software_id text,
  software_version text,
  software_statement text,
  redirect_uris text[] NOT NULL,
  post_logout_redirect_uris text[],
  backchannel_logout_uri text,
  backchannel_logout_session_required boolean,
  token_endpoint_auth_method text,
  application_type text,
  jwks text,
  jwks_uri text,
  grant_types text[],
  response_types text[],
  require_pkce boolean,
  dpop_bound_access_tokens boolean,
  reference_id text,
  metadata jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS oauth_client_client_id_uq ON identity.oauth_client (client_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity.oauth_resource (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  name text NOT NULL,
  access_token_ttl integer,
  refresh_token_ttl integer,
  signing_algorithm text,
  signing_key_id text,
  allowed_scopes text[],
  custom_claims jsonb,
  dpop_bound_access_tokens_required boolean,
  disabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  policy_version integer,
  metadata jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS oauth_resource_identifier_uq ON identity.oauth_resource (identifier);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity.oauth_client_resource (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  resource_id text NOT NULL,
  metadata jsonb,
  created_at timestamptz
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity.oauth_client_assertion (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity.oauth_refresh_token (
  id text PRIMARY KEY,
  token text NOT NULL,
  client_id text NOT NULL,
  session_id text,
  user_id uuid NOT NULL,
  reference_id text,
  authorization_code_id text,
  resources text[],
  requested_user_info_claims text[],
  expires_at timestamptz,
  created_at timestamptz,
  revoked timestamptz,
  rotated_at timestamptz,
  rotation_replay_response text,
  rotation_replay_expires_at timestamptz,
  auth_time timestamptz,
  confirmation jsonb,
  scopes text[] NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS oauth_refresh_token_token_uq ON identity.oauth_refresh_token (token);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS oauth_refresh_token_user_client_idx ON identity.oauth_refresh_token (user_id, client_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity.oauth_access_token (
  id text PRIMARY KEY,
  token text,
  client_id text NOT NULL,
  session_id text,
  user_id uuid,
  reference_id text,
  authorization_code_id text,
  resources text[],
  requested_user_info_claims text[],
  refresh_id text,
  expires_at timestamptz,
  created_at timestamptz,
  revoked timestamptz,
  confirmation jsonb,
  scopes text[] NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS oauth_access_token_token_uq ON identity.oauth_access_token (token);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS oauth_access_token_user_client_idx ON identity.oauth_access_token (user_id, client_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS identity.oauth_consent (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  user_id uuid,
  reference_id text,
  resources text[],
  requested_user_info_claims text[],
  scopes text[] NOT NULL,
  created_at timestamptz,
  updated_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS oauth_consent_user_client_uq ON identity.oauth_consent (user_id, client_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS shared_kernel.mcp_write_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  call_id uuid NOT NULL,
  batch_id uuid,
  tool text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  op text NOT NULL CHECK (op IN ('create', 'update', 'delete')),
  before_jsonb jsonb,
  after_jsonb jsonb,
  entry_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  reverted_by_call_id uuid
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcp_write_log_user_client_created_idx ON shared_kernel.mcp_write_log (user_id, client_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcp_write_log_batch_idx ON shared_kernel.mcp_write_log (batch_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcp_write_log_call_idx ON shared_kernel.mcp_write_log (call_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS shared_kernel.mcp_import_previews (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  kind text NOT NULL,
  payload_hash text NOT NULL,
  rows_jsonb jsonb NOT NULL,
  issues_jsonb jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcp_import_previews_user_expires_idx ON shared_kernel.mcp_import_previews (user_id, expires_at);
--> statement-breakpoint
ALTER TABLE identity.oauth_access_token ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE identity.oauth_access_token FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS oauth_access_token_owner ON identity.oauth_access_token;
--> statement-breakpoint
CREATE POLICY oauth_access_token_owner ON identity.oauth_access_token
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (current_setting('app.better_auth', true) = 'on' OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (current_setting('app.better_auth', true) = 'on' OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE identity.oauth_refresh_token ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE identity.oauth_refresh_token FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS oauth_refresh_token_owner ON identity.oauth_refresh_token;
--> statement-breakpoint
CREATE POLICY oauth_refresh_token_owner ON identity.oauth_refresh_token
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (current_setting('app.better_auth', true) = 'on' OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (current_setting('app.better_auth', true) = 'on' OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE identity.oauth_consent ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE identity.oauth_consent FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS oauth_consent_owner ON identity.oauth_consent;
--> statement-breakpoint
CREATE POLICY oauth_consent_owner ON identity.oauth_consent
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (current_setting('app.better_auth', true) = 'on' OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (current_setting('app.better_auth', true) = 'on' OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE shared_kernel.mcp_write_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shared_kernel.mcp_write_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS mcp_write_log_owner ON shared_kernel.mcp_write_log;
--> statement-breakpoint
CREATE POLICY mcp_write_log_owner ON shared_kernel.mcp_write_log
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE shared_kernel.mcp_import_previews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shared_kernel.mcp_import_previews FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS mcp_import_previews_owner ON shared_kernel.mcp_import_previews;
--> statement-breakpoint
CREATE POLICY mcp_import_previews_owner ON shared_kernel.mcp_import_previews
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
