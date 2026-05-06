-- Per-role per-schema USAGE grants (principle of least privilege).
-- D-18 / T-1 mitigation: cross-schema grants are forbidden — each role only
-- gets what it needs.
-- Note: comparison schema is NOT granted to app_role/worker_role in Phase 1
-- (future comparison_role will be added in the comparison bounded context).

-- app_role: API service — read/write to operational schemas
GRANT USAGE ON SCHEMA identity TO app_role;
GRANT USAGE ON SCHEMA tenancy TO app_role;
GRANT USAGE ON SCHEMA shared_kernel TO app_role;

-- worker_role: background worker — read/write to operational schemas
GRANT USAGE ON SCHEMA identity TO worker_role;
GRANT USAGE ON SCHEMA tenancy TO worker_role;
GRANT USAGE ON SCHEMA shared_kernel TO worker_role;

-- migrator: owns all schemas (AUTHORIZATION migrator in 01-schemas.sql);
-- explicit USAGE grants are redundant for the owner but added for documentation.
GRANT USAGE ON SCHEMA identity TO migrator;
GRANT USAGE ON SCHEMA tenancy TO migrator;
GRANT USAGE ON SCHEMA shared_kernel TO migrator;
GRANT USAGE ON SCHEMA comparison TO migrator;

-- Public schema: no grants to app_role/worker_role beyond default.
-- We rely on the default public schema for drizzle internals (migrations table).
GRANT USAGE ON SCHEMA public TO app_role, worker_role, migrator;
