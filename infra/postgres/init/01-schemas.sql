-- D-17: Create the four bounded-context schemas.
-- Executed automatically by docker-entrypoint-initdb.d (plain .sql extension).
-- These schemas are created owned by migrator so that drizzle-kit migrate can
-- create tables within them without requiring superuser.
-- Runs after 00-roles.sh (lexical order guarantees migrator role exists first).

CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION migrator;
CREATE SCHEMA IF NOT EXISTS tenancy AUTHORIZATION migrator;
CREATE SCHEMA IF NOT EXISTS shared_kernel AUTHORIZATION migrator;
CREATE SCHEMA IF NOT EXISTS budgeting AUTHORIZATION migrator;
CREATE SCHEMA IF NOT EXISTS comparison AUTHORIZATION migrator;

-- Set default search_path to include all bounded-context schemas.
-- Services should always qualify schema names explicitly; this is a convenience fallback.
ALTER DATABASE budget SET search_path TO public, identity, tenancy, shared_kernel, budgeting;
