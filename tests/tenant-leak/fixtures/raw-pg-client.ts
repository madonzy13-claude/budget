/**
 * raw-pg-client.ts
 *
 * PC-28: Raw pg.Client factory for tenant-leak tests 1 + 4.
 * These tests intentionally bypass the app transaction primitives to prove RLS
 * enforces independently of app code (T-13 green-washing protection).
 *
 * NEVER sets app.tenant_ids or app.current_user_id — that is the whole point.
 * Used only in tests that verify the absence of GUCs yields 0 rows.
 */
import { Client } from "pg";

/**
 * Returns a new pg.Client connected as app_role WITHOUT any GUC set.
 * Caller is responsible for calling client.connect() and client.end().
 */
export function rawAppClient(): Client {
  const url = process.env.DATABASE_URL_APP;
  if (!url)
    throw new Error(
      "DATABASE_URL_APP not set — run startTestcontainer() in beforeAll()",
    );
  return new Client({ connectionString: url });
}

/**
 * Returns a new pg.Client connected as worker_role WITHOUT any GUC set.
 * Caller is responsible for calling client.connect() and client.end().
 */
export function rawWorkerClient(): Client {
  const url = process.env.DATABASE_URL_WORKER;
  if (!url)
    throw new Error(
      "DATABASE_URL_WORKER not set — run startTestcontainer() in beforeAll()",
    );
  return new Client({ connectionString: url });
}

/**
 * Returns a new pg.Client connected as migrator (admin-ish role).
 * Used for Test 3 (pg_roles NOBYPASSRLS) and Test 4 (force-rls-on-all-tables).
 * Caller is responsible for calling client.connect() and client.end().
 */
export function rawMigratorClient(): Client {
  const url = process.env.DATABASE_URL_MIGRATOR;
  if (!url)
    throw new Error(
      "DATABASE_URL_MIGRATOR not set — run startTestcontainer() in beforeAll()",
    );
  return new Client({ connectionString: url });
}
