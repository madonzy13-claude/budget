import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { configureNumericParsers } from "./numeric-parser";

configureNumericParsers();

let _appPool: Pool | undefined;
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
  _workerPool = undefined;
  _migratorPool = undefined;
}

export const appDb = () => drizzle(appPool(), { casing: "snake_case" });
export const workerDb = () => drizzle(workerPool(), { casing: "snake_case" });
