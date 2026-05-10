/**
 * category-limit-effective-dated.test.ts — Integration tests for SCD-2 limit logic.
 * TDD RED phase: tests written before implementation.
 * Requires real Postgres (DATABASE_URL_APP env set by infisical wrapper).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";

// These imports will fail at RED phase — that's expected
import { DrizzleCategoryLimitRepo } from "../src/adapters/persistence/category-limit-repo";
import { DrizzleCategoryRepo } from "../src/adapters/persistence/category-repo";

const TEST_TENANT = crypto.randomUUID();
const TEST_USER = crypto.randomUUID();

let categoryId: string;
let limitRepo: DrizzleCategoryLimitRepo;
let categoryRepo: DrizzleCategoryRepo;

async function getRawDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  return { db: drizzle(pool), pool };
}

beforeAll(async () => {
  // Create test tenant + category
  const { db, pool } = await getRawDb();
  // Insert workspace (tenant) using migrator role bypass
  await db.execute(sql`
    INSERT INTO tenancy.workspaces (id, name, kind, default_currency, created_by_user_id)
    VALUES (${TEST_TENANT}::uuid, 'Test Workspace', 'SHARED', 'EUR', ${TEST_USER}::uuid)
    ON CONFLICT DO NOTHING
  `);
  // Insert category
  categoryId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO budgeting.categories (id, tenant_id, name, parent_id, scope, actor_user_id)
    VALUES (${categoryId}::uuid, ${TEST_TENANT}::uuid, 'Food', NULL, 'SHARED', ${TEST_USER}::uuid)
    ON CONFLICT DO NOTHING
  `);
  await pool.end();

  limitRepo = new DrizzleCategoryLimitRepo();
  categoryRepo = new DrizzleCategoryRepo();
});

afterAll(async () => {
  const { db, pool } = await getRawDb();
  await db.execute(sql`DELETE FROM budgeting.category_limits WHERE tenant_id = ${TEST_TENANT}::uuid`);
  await db.execute(sql`DELETE FROM budgeting.categories WHERE tenant_id = ${TEST_TENANT}::uuid`);
  await db.execute(sql`DELETE FROM tenancy.workspaces WHERE id = ${TEST_TENANT}::uuid`);
  await pool.end();
});

describe("CategoryLimit SCD-2 effective-dated logic", () => {
  test("set initial limit for Jan 1 (€400 normal, €450 cushion)", async () => {
    await limitRepo.setLimit({
      tenantId: TEST_TENANT,
      categoryId,
      normalAmount: "40000",
      normalCurrency: "EUR",
      cushionAmount: "45000",
      cushionCurrency: "EUR",
      effectiveFrom: "2026-01-01",
      actorUserId: TEST_USER,
    });

    const limit = await limitRepo.getEffectiveLimit(TEST_TENANT, categoryId, "2026-01-15");
    expect(limit).not.toBeNull();
    expect(limit!.normalAmount).toBe("40000");
    expect(limit!.effectiveTo).toBeNull();
  });

  test("set new limit for May 15 (€500 normal) — closes Jan row", async () => {
    await limitRepo.setLimit({
      tenantId: TEST_TENANT,
      categoryId,
      normalAmount: "50000",
      normalCurrency: "EUR",
      cushionAmount: "55000",
      cushionCurrency: "EUR",
      effectiveFrom: "2026-05-15",
      actorUserId: TEST_USER,
    });

    // Old row should be closed
    const april = await limitRepo.getEffectiveLimit(TEST_TENANT, categoryId, "2026-04-30");
    expect(april!.normalAmount).toBe("40000");
    expect(april!.effectiveTo).toBe("2026-05-14");

    // New row active on May 15
    const may15 = await limitRepo.getEffectiveLimit(TEST_TENANT, categoryId, "2026-05-15");
    expect(may15!.normalAmount).toBe("50000");
    expect(may15!.effectiveTo).toBeNull();
  });

  test("getEffectiveLimit Jun 1 returns May 15 row (still open)", async () => {
    const june = await limitRepo.getEffectiveLimit(TEST_TENANT, categoryId, "2026-06-01");
    expect(june!.normalAmount).toBe("50000");
    expect(june!.effectiveTo).toBeNull();
  });

  test("Pitfall 5: setting limit twice on same day produces exactly 1 open row", async () => {
    // Set same-day limit twice
    await limitRepo.setLimit({
      tenantId: TEST_TENANT,
      categoryId,
      normalAmount: "60000",
      normalCurrency: "EUR",
      cushionAmount: "65000",
      cushionCurrency: "EUR",
      effectiveFrom: "2026-06-01",
      actorUserId: TEST_USER,
    });
    await limitRepo.setLimit({
      tenantId: TEST_TENANT,
      categoryId,
      normalAmount: "70000",
      normalCurrency: "EUR",
      cushionAmount: "75000",
      cushionCurrency: "EUR",
      effectiveFrom: "2026-06-01",
      actorUserId: TEST_USER,
    });

    const { db, pool } = await getRawDb();
    const result = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text as count FROM budgeting.category_limits WHERE category_id = ${categoryId}::uuid AND effective_to IS NULL`
    );
    await pool.end();
    expect(result.rows[0].count).toBe("1");
  });

  test("property: for any date in history, exactly one row matches PIT predicate", async () => {
    const testDates = ["2026-01-01", "2026-03-15", "2026-05-14", "2026-05-15", "2026-06-01", "2026-12-31"];
    const { db, pool } = await getRawDb();
    for (const d of testDates) {
      const result = await db.execute<{ count: string }>(sql`
        SELECT count(*)::text as count FROM budgeting.category_limits
        WHERE category_id = ${categoryId}::uuid
          AND effective_from <= ${d}::date
          AND (effective_to IS NULL OR effective_to >= ${d}::date)
      `);
      expect(result.rows[0].count).toBe("1");
    }
    await pool.end();
  });
});
