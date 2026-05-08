-- pg-boss queue schema. Owned by worker_role so pg-boss can run its internal
-- migrations (CREATE TABLE/INDEX) on start() without granting CREATE on the
-- whole budget database.
-- Ownership grants USAGE + CREATE implicitly. NOBYPASSRLS on worker_role
-- still applies; pgboss tables carry no tenant_id and have no RLS policies.
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION worker_role;
