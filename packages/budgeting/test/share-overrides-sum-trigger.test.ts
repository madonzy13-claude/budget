/**
 * share-overrides-sum-trigger.test.ts — Integration tests for DEFERRABLE sum-100 trigger.
 * TDD RED phase: written before implementation.
 * Requires real Postgres (DATABASE_URL_APP env).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

const TEST_TENANT = crypto.randomUUID();
const TEST_USER = crypto.randomUUID();
const TEST_USER2 = crypto.randomUUID();
let categoryId: string;

async function getRawDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  return { db: drizzle(pool), pool };
}

beforeAll(async () => {
  const { db, pool } = await getRawDb();
  await db.execute(sql`
    INSERT INTO tenancy.workspaces (id, name, kind, default_currency, created_by_user_id)
    VALUES (${TEST_TENANT}::uuid, 'Share Test Workspace', 'SHARED', 'EUR', ${TEST_USER}::uuid)
    ON CONFLICT DO NOTHING
  `);
  categoryId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO budgeting.categories (id, tenant_id, name, scope, actor_user_id)
    VALUES (${categoryId}::uuid, ${TEST_TENANT}::uuid, 'Groceries', 'SHARED', ${TEST_USER}::uuid)
    ON CONFLICT DO NOTHING
  `);
  await pool.end();
});

afterAll(async () => {
  const { db, pool } = await getRawDb();
  await db.execute(sql`DELETE FROM budgeting.category_share_overrides WHERE category_id = ${categoryId}::uuid`);
  await db.execute(sql`DELETE FROM budgeting.categories WHERE tenant_id = ${TEST_TENANT}::uuid`);
  await db.execute(sql`DELETE FROM tenancy.workspaces WHERE id = ${TEST_TENANT}::uuid`);
  await pool.end();
});

describe("category_share_overrides sum-100 deferred trigger", () => {
  test("inserting entries summing to 100% succeeds", async () => {
    const result = await withTenantTx(
      TenantId(TEST_TENANT),
      UserId(TEST_USER),
      async (tx) => {
        await tx.execute(sql`
          INSERT INTO budgeting.category_share_overrides (category_id, user_id, tenant_id, percentage)
          VALUES
            (${categoryId}::uuid, ${TEST_USER}::uuid, ${TEST_TENANT}::uuid, 60),
            (${categoryId}::uuid, ${TEST_USER2}::uuid, ${TEST_TENANT}::uuid, 40)
        `);
      }
    );
    expect(result.isOk()).toBe(true);
  });

  test("clean up entries from previous test", async () => {
    const { db, pool } = await getRawDb();
    await db.execute(sql`DELETE FROM budgeting.category_share_overrides WHERE category_id = ${categoryId}::uuid`);
    await pool.end();
  });

  test("inserting entries summing to 99% fails at COMMIT (trigger is DEFERRABLE)", async () => {
    const result = await withTenantTx(
      TenantId(TEST_TENANT),
      UserId(TEST_USER),
      async (tx) => {
        await tx.execute(sql`
          INSERT INTO budgeting.category_share_overrides (category_id, user_id, tenant_id, percentage)
          VALUES
            (${categoryId}::uuid, ${TEST_USER}::uuid, ${TEST_TENANT}::uuid, 60),
            (${categoryId}::uuid, ${TEST_USER2}::uuid, ${TEST_TENANT}::uuid, 39)
        `);
        // Mid-tx sum is 99% — trigger deferred to COMMIT
      }
    );
    // Trigger fires at commit → transaction fails
    expect(result.isErr()).toBe(true);
    expect(result.error.message).toContain("must sum to 100");
  });

  test("single-entry insert (total=50%) fails at COMMIT", async () => {
    const result = await withTenantTx(
      TenantId(TEST_TENANT),
      UserId(TEST_USER),
      async (tx) => {
        await tx.execute(sql`
          INSERT INTO budgeting.category_share_overrides (category_id, user_id, tenant_id, percentage)
          VALUES (${categoryId}::uuid, ${TEST_USER}::uuid, ${TEST_TENANT}::uuid, 50)
        `);
      }
    );
    expect(result.isErr()).toBe(true);
  });

  test("empty table allows all inserts summing to 100 (no short-circuit when sum=0)", async () => {
    // Already cleaned; fresh inserts summing to exactly 100
    const result = await withTenantTx(
      TenantId(TEST_TENANT),
      UserId(TEST_USER),
      async (tx) => {
        await tx.execute(sql`
          INSERT INTO budgeting.category_share_overrides (category_id, user_id, tenant_id, percentage)
          VALUES (${categoryId}::uuid, ${TEST_USER}::uuid, ${TEST_TENANT}::uuid, 100)
        `);
      }
    );
    expect(result.isOk()).toBe(true);
  });
});
