/**
 * category-limit-effective-dated.test.ts — Integration tests for SCD-2 limit logic.
 * TDD RED phase: tests written before implementation.
 * Requires real Postgres (DATABASE_URL_APP env set by infisical wrapper).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

// These imports will fail at RED phase — that's expected
import { DrizzleCategoryLimitRepo } from "../src/adapters/persistence/category-limit-repo";

// Normalize Docker hostname → localhost for host-side test runner
if (process.env.DATABASE_URL_APP) {
  process.env.DATABASE_URL_APP = process.env.DATABASE_URL_APP.replace(
    "@db:",
    "@localhost:",
  );
}
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace(
    "@db:",
    "@localhost:",
  );
}

const TEST_TENANT = crypto.randomUUID();
const TEST_USER = crypto.randomUUID();

let categoryId: string;
let limitRepo: DrizzleCategoryLimitRepo;

async function getRawDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  return { db: drizzle(pool), pool };
}

beforeAll(async () => {
  // Create test tenant + category
  const { db, pool } = await getRawDb();
  const slug = `test-ws-${TEST_TENANT.substring(0, 8)}`;
  // Set RLS GUC and insert workspace
  await db.execute(sql.raw(`SET app.current_user_id = '${TEST_USER}'`));
  await db.execute(sql.raw(`SET app.tenant_ids = '{${TEST_TENANT}}'`));
  // Insert user (required for FK)
  await db.execute(sql`
    INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
    VALUES (${TEST_USER}::uuid, ${"cat-limit-" + TEST_USER.slice(0, 8) + "@example.com"}, 'Limit Test User', true, now(), now())
    ON CONFLICT DO NOTHING
  `);
  // Insert tenant budget (v1.1 — was workspaces in v1.0)
  await db.execute(sql`
    INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
    VALUES (${TEST_TENANT}::uuid, ${slug}, 'Test Budget', 'PRIVATE', 'EUR', ${TEST_USER}::uuid, 1, now())
    ON CONFLICT DO NOTHING
  `);
  await pool.end();

  // Insert category via withTenantTx (RLS requires app.tenant_ids GUC)
  categoryId = crypto.randomUUID();
  const r = await withTenantTx(
    TenantId(TEST_TENANT),
    UserId(TEST_USER),
    async (tx) => {
      await tx.execute(sql`
      INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
      VALUES (${categoryId}::uuid, ${TEST_TENANT}::uuid, 'Food', now(), ${TEST_USER}::uuid)
      ON CONFLICT DO NOTHING
    `);
    },
  );
  if (r.isErr()) throw r.error;

  limitRepo = new DrizzleCategoryLimitRepo();
});

afterAll(async () => {
  const { db, pool } = await getRawDb();
  await db.execute(sql.raw(`SET app.tenant_ids = '{${TEST_TENANT}}'`));
  await db.execute(
    sql`DELETE FROM budgeting.category_limits WHERE tenant_id = ${TEST_TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM budgeting.categories WHERE tenant_id = ${TEST_TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM tenancy.budgets WHERE id = ${TEST_TENANT}::uuid`,
  );
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

    const limit = await limitRepo.getEffectiveLimit(
      TEST_TENANT,
      categoryId,
      "2026-01-15",
    );
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
    const april = await limitRepo.getEffectiveLimit(
      TEST_TENANT,
      categoryId,
      "2026-04-30",
    );
    expect(april!.normalAmount).toBe("40000");
    expect(april!.effectiveTo).toBe("2026-05-14");

    // New row active on May 15
    const may15 = await limitRepo.getEffectiveLimit(
      TEST_TENANT,
      categoryId,
      "2026-05-15",
    );
    expect(may15!.normalAmount).toBe("50000");
    expect(may15!.effectiveTo).toBeNull();
  });

  test("getEffectiveLimit Jun 1 returns May 15 row (still open)", async () => {
    const june = await limitRepo.getEffectiveLimit(
      TEST_TENANT,
      categoryId,
      "2026-06-01",
    );
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
    await db.execute(sql.raw(`SET app.tenant_ids = '{${TEST_TENANT}}'`));
    const result = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text as count FROM budgeting.category_limits WHERE category_id = ${categoryId}::uuid AND effective_to IS NULL`,
    );
    await pool.end();
    expect(result.rows[0].count).toBe("1");
  });

  test("property: for any date in history, exactly one row matches PIT predicate", async () => {
    const testDates = [
      "2026-01-01",
      "2026-03-15",
      "2026-05-14",
      "2026-05-15",
      "2026-06-01",
      "2026-12-31",
    ];
    const { db, pool } = await getRawDb();
    await db.execute(sql.raw(`SET app.tenant_ids = '{${TEST_TENANT}}'`));
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
