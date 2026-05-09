/**
 * Integration tests for DrizzleFxRateCacheRepo.
 * TDD: uses real Postgres via DATABASE_URL_WORKER (worker_role has INSERT/SELECT/UPDATE).
 * Uses migrator for cleanup (DELETE) in beforeAll/afterAll.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { DrizzleFxRateCacheRepo } from "../src/adapters/persistence/fx-rate-cache-repo";

// worker_role has SELECT + INSERT + UPDATE on fx_rates (see post-migration.sql)
const WORKER_URL =
  process.env.DATABASE_URL_WORKER ??
  process.env.DATABASE_URL_APP?.replace("app_role:", "worker_role:").replace(
    "622234ef8ab54ccbc631b01086e6a2d4",
    "cad7d5bdf1f17ef2266eddc7ac9bde72",
  );

// migrator has full access including DELETE (for cleanup)
const MIGRATOR_URL = process.env.DATABASE_URL_MIGRATOR;

let workerPool: Pool;
let migratorPool: Pool;
let repo: DrizzleFxRateCacheRepo;

beforeAll(async () => {
  if (!WORKER_URL) throw new Error("DATABASE_URL_WORKER not set");
  workerPool = new Pool({ connectionString: WORKER_URL });
  repo = new DrizzleFxRateCacheRepo(workerPool);
  // Clean slate: migrator role can DELETE
  if (MIGRATOR_URL) {
    migratorPool = new Pool({ connectionString: MIGRATOR_URL });
    const db = drizzle(migratorPool);
    await db.execute(
      sql`DELETE FROM budgeting.fx_rates WHERE provider = 'test'`,
    );
  }
});

afterAll(async () => {
  if (MIGRATOR_URL && migratorPool) {
    const db = drizzle(migratorPool);
    await db.execute(
      sql`DELETE FROM budgeting.fx_rates WHERE provider = 'test'`,
    );
    await migratorPool.end();
  }
  await workerPool.end();
});

describe("DrizzleFxRateCacheRepo", () => {
  test("upsert then lookup returns the same rate", async () => {
    await repo.upsert("USD", "EUR", "2026-05-09", "0.92000000", "test");
    const result = await repo.lookup("USD", "EUR", "2026-05-09");
    expect(result).not.toBeNull();
    expect(result!.rate).toBe("0.92000000");
    expect(result!.date).toBe("2026-05-09");
  });

  test("upsert twice with same PK updates the rate", async () => {
    await repo.upsert("USD", "GBP", "2026-05-09", "0.78000000", "test");
    await repo.upsert("USD", "GBP", "2026-05-09", "0.79000000", "test");
    const result = await repo.lookup("USD", "GBP", "2026-05-09");
    expect(result).not.toBeNull();
    expect(result!.rate).toBe("0.79000000");
  });

  test("mostRecentPrior with no rows returns null", async () => {
    const result = await repo.mostRecentPrior("XYZ", "ABC", "2026-05-09");
    expect(result).toBeNull();
  });

  test("mostRecentPrior returns most recent date before beforeDate", async () => {
    // Seed two rows: 2026-05-05 and 2026-05-08
    await repo.upsert("EUR", "PLN", "2026-05-05", "4.22000000", "test");
    await repo.upsert("EUR", "PLN", "2026-05-08", "4.25000000", "test");
    // Query before 2026-05-09 → should return 2026-05-08
    const result = await repo.mostRecentPrior("EUR", "PLN", "2026-05-09");
    expect(result).not.toBeNull();
    expect(result!.date).toBe("2026-05-08");
    expect(result!.rate).toBe("4.25000000");
  });
});
