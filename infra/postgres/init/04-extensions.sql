-- Performance observability extensions.
--
-- Runs as the postgres superuser on FIRST cluster init only (docker-entrypoint-initdb.d).
-- CREATE EXTENSION needs superuser, which is why this lives here rather than in a
-- drizzle migration (the migrator connects as migrator_role, which cannot do it).
--
-- pg_stat_statements is already in shared_preload_libraries (see
-- infra/postgres/postgresql.conf), so the counters are collected regardless — but
-- without the extension the pg_stat_statements VIEW does not exist and nothing can
-- read them. That was the state until 2026-08-14: 16 days of statistics collected
-- into shared memory with no way to query them.
--
-- On an existing volume this file does NOT re-run. Apply by hand once:
--   docker exec budget-db-1 psql -U postgres -d budget \
--     -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Let the app and worker roles READ the stats view. They cannot reset it —
-- pg_stat_statements_reset() stays superuser-only, so a compromised app_role
-- cannot erase the performance record.
GRANT SELECT ON pg_stat_statements TO app_role, worker_role;
