import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { configureNumericParsers } from "./numeric-parser";

configureNumericParsers();

let _appPool: Pool | undefined;
let _betterAuthPool: Pool | undefined;
let _workerPool: Pool | undefined;
let _migratorPool: Pool | undefined;

/**
 * Returns the DATABASE_URL_APP connection string from process.env.
 * pool.ts reads env vars directly (not via loadEnv()) so it can be used
 * in test contexts where only DB URLs are set (testcontainer bootstrap sets
 * DATABASE_URL_* before pools are created; other env vars are not needed at pool level).
 */
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export function appPool(): Pool {
  if (!_appPool) {
    _appPool = new Pool({
      connectionString: requireEnv("DATABASE_URL_APP"),
      application_name: "budget-api",
      // PERF 260613-dn1 #2: default pg max is 10 → contention collapse under
      // parallel home-page load (72 concurrent txs for 12-budget user; parallel
      // measured at 7261ms vs serial 1087ms). max:25 absorbs burst while keeping
      // api(25)+worker(10) well under PG max_connections=100.
      max: 25,
    });
  }
  return _appPool;
}

/**
 * Dedicated app_role pool for Better Auth's Drizzle adapter. Identical to appPool
 * EXCEPT every connection carries the `app.better_auth=on` GUC, set at connection
 * STARTUP via the libpq `options` param (race-free — applied before any query, vs
 * a pool 'connect' handler which can lose the race with the first query).
 *
 * SECURITY (T-10 / Phase 10): identity.accounts + identity.sessions UPDATE/DELETE
 * RLS permits a write when this marker is 'on'. Better Auth runs reset-password
 * (unauthenticated token flow) and session revoke with NO app.current_user_id GUC,
 * so a strict owner-only policy silently no-ops those writes. Scoping the bypass to
 * THIS pool — instead of "any connection with no GUC" — means an arbitrary
 * contextless app_role query (e.g. a SQLi on some other route) still CANNOT touch
 * those tables; only Better Auth's own token/session-gated handlers can. The
 * trust boundary stays Better Auth's app-layer validation, same as before.
 */
export function betterAuthPool(): Pool {
  if (!_betterAuthPool) {
    _betterAuthPool = new Pool({
      connectionString: requireEnv("DATABASE_URL_APP"),
      application_name: "budget-auth",
      options: "-c app.better_auth=on",
      max: 10,
    });
  }
  return _betterAuthPool;
}

export function workerPool(): Pool {
  if (!_workerPool) {
    _workerPool = new Pool({
      connectionString: requireEnv("DATABASE_URL_WORKER"),
      application_name: "budget-worker",
    });
  }
  return _workerPool;
}

export function migratorPool(): Pool {
  if (!_migratorPool) {
    _migratorPool = new Pool({
      connectionString: requireEnv("DATABASE_URL_MIGRATOR"),
      application_name: "budget-migrator",
    });
  }
  return _migratorPool;
}

/** Reset pool singletons — used in tests to pick up new DATABASE_URL_* after testcontainer starts. */
export function resetPools(): void {
  _appPool = undefined;
  _betterAuthPool = undefined;
  _workerPool = undefined;
  _migratorPool = undefined;
}

export const appDb = () => drizzle(appPool(), { casing: "snake_case" });
export const workerDb = () => drizzle(workerPool(), { casing: "snake_case" });
