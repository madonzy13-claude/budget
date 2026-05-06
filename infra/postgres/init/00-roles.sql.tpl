-- T-3 mitigation: All roles declared NOBYPASSRLS to prevent RLS bypass escalation.
-- T-14 mitigation: Passwords supplied via psql -v variables from env; no hardcoded secrets.
-- PC-19: Executed by 00-roles.sh (not auto-run by docker-entrypoint-initdb.d directly).
-- All roles are idempotent (DO $$ IF NOT EXISTS $$).

-- app_role: used by the API service (RLS-enforced connection)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    EXECUTE 'CREATE ROLE app_role LOGIN PASSWORD ' || quote_literal(:'app_pwd') ||
            ' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT';
    RAISE NOTICE 'Created role: app_role (NOBYPASSRLS)';
  ELSE
    -- Update password idempotently in case it changed
    EXECUTE 'ALTER ROLE app_role PASSWORD ' || quote_literal(:'app_pwd');
    RAISE NOTICE 'Role app_role already exists — password updated';
  END IF;
END
$$;

-- worker_role: used by the background worker service (RLS-enforced connection)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worker_role') THEN
    EXECUTE 'CREATE ROLE worker_role LOGIN PASSWORD ' || quote_literal(:'worker_pwd') ||
            ' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT';
    RAISE NOTICE 'Created role: worker_role (NOBYPASSRLS)';
  ELSE
    EXECUTE 'ALTER ROLE worker_role PASSWORD ' || quote_literal(:'worker_pwd');
    RAISE NOTICE 'Role worker_role already exists — password updated';
  END IF;
END
$$;

-- migrator: used exclusively by drizzle-kit migrate (elevated — CREATEDB for schema ops, but still NOBYPASSRLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    EXECUTE 'CREATE ROLE migrator LOGIN PASSWORD ' || quote_literal(:'migrator_pwd') ||
            ' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT';
    RAISE NOTICE 'Created role: migrator (NOBYPASSRLS)';
  ELSE
    EXECUTE 'ALTER ROLE migrator PASSWORD ' || quote_literal(:'migrator_pwd');
    RAISE NOTICE 'Role migrator already exists — password updated';
  END IF;
END
$$;

-- Grant migrator superuser-equivalent DDL rights on the budget database only.
-- The migrator role needs CREATE on the database to create schemas and tables.
GRANT ALL PRIVILEGES ON DATABASE budget TO migrator;
