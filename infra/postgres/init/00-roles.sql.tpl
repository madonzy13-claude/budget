-- T-3 mitigation: All roles declared NOBYPASSRLS to prevent RLS bypass escalation.
-- T-14 mitigation: Passwords supplied via psql -v variables from env; no hardcoded secrets.
-- PC-19: Executed by 00-roles.sh (not auto-run by docker-entrypoint-initdb.d directly).
--
-- NOTE: :'varname' psql substitution does NOT work inside DO $$ ... $$ dollar-quoted blocks
-- (psql stops substituting inside dollar-quoted strings). Use SELECT format() + \gexec at
-- top level instead — substitution happens before the statement is sent to the server.

-- app_role: used by the API service (RLS-enforced connection)
SELECT format(
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role')
    THEN 'ALTER ROLE app_role PASSWORD %L'
    ELSE 'CREATE ROLE app_role LOGIN PASSWORD %L NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'
  END,
  :'app_pwd'
) \gexec

-- worker_role: used by the background worker service (RLS-enforced connection)
SELECT format(
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worker_role')
    THEN 'ALTER ROLE worker_role PASSWORD %L'
    ELSE 'CREATE ROLE worker_role LOGIN PASSWORD %L NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'
  END,
  :'worker_pwd'
) \gexec

-- migrator: used exclusively by drizzle-kit migrate (NOBYPASSRLS enforced)
SELECT format(
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator')
    THEN 'ALTER ROLE migrator PASSWORD %L'
    ELSE 'CREATE ROLE migrator LOGIN PASSWORD %L NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'
  END,
  :'migrator_pwd'
) \gexec

-- Grant migrator DDL rights on the budget database.
GRANT ALL PRIVILEGES ON DATABASE budget TO migrator;
