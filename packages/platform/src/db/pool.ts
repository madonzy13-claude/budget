import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { loadEnv } from "@budget/shared-kernel";
import { configureNumericParsers } from "./numeric-parser";

configureNumericParsers();

let _appPool: Pool | undefined;
let _workerPool: Pool | undefined;
let _migratorPool: Pool | undefined;

export function appPool(): Pool {
  if (!_appPool) {
    const env = loadEnv();
    _appPool = new Pool({
      connectionString: env.DATABASE_URL_APP,
      application_name: "budget-api",
    });
  }
  return _appPool;
}

export function workerPool(): Pool {
  if (!_workerPool) {
    const env = loadEnv();
    _workerPool = new Pool({
      connectionString: env.DATABASE_URL_WORKER,
      application_name: "budget-worker",
    });
  }
  return _workerPool;
}

export function migratorPool(): Pool {
  if (!_migratorPool) {
    const env = loadEnv();
    _migratorPool = new Pool({
      connectionString: env.DATABASE_URL_MIGRATOR,
      application_name: "budget-migrator",
    });
  }
  return _migratorPool;
}

export const appDb = () => drizzle(appPool(), { casing: "snake_case" });
export const workerDb = () => drizzle(workerPool(), { casing: "snake_case" });
