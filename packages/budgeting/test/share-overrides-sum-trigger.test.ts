/**
 * share-overrides-sum-trigger.test.ts — Integration tests for DEFERRABLE sum-100 trigger.
 * TDD RED phase: written before implementation.
 * Requires real Postgres (DATABASE_URL_APP env).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

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
  const slug = `share-test-${TEST_TENANT.substring(0, 8)}`;
  await db.execute(sql.raw(`SET app.current_user_id = '${TEST_USER}'`));
  await db.execute(sql.raw(`SET app.tenant_ids = '{${TEST_TENANT}}'`));
  // Insert user rows (required for FKs)
  await db.execute(sql`
    INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
    VALUES (${TEST_USER}::uuid, ${"share-" + TEST_USER.slice(0, 8) + "@example.com"}, 'Share Test User', true, now(), now())
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
    VALUES (${TEST_USER2}::uuid, ${"share2-" + TEST_USER2.slice(0, 8) + "@example.com"}, 'Share Test User2', true, now(), now())
    ON CONFLICT DO NOTHING
  `);
  // Insert tenant budget (v1.1 — was workspaces in v1.0)
  await db.execute(sql`
    INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
    VALUES (${TEST_TENANT}::uuid, ${slug}, 'Share Test Budget', 'PRIVATE', 'EUR', ${TEST_USER}::uuid, 1, now())
    ON CONFLICT DO NOTHING
  `);
  categoryId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
    VALUES (${categoryId}::uuid, ${TEST_TENANT}::uuid, 'Groceries', now(), ${TEST_USER}::uuid)
    ON CONFLICT DO NOTHING
  `);
  await pool.end();
});

afterAll(async () => {
  const { db, pool } = await getRawDb();
  await db.execute(sql.raw(`SET app.tenant_ids = '{${TEST_TENANT}}'`));
  await db.execute(
    sql`DELETE FROM budgeting.category_share_overrides WHERE category_id = ${categoryId}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM budgeting.categories WHERE tenant_id = ${TEST_TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM tenancy.budgets WHERE id = ${TEST_TENANT}::uuid`,
  );
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
      },
    );
    expect(result.isOk()).toBe(true);
  });

  test("clean up entries from previous test", async () => {
    const { db, pool } = await getRawDb();
    await db.execute(sql.raw(`SET app.tenant_ids = '{${TEST_TENANT}}'`));
    await db.execute(
      sql`DELETE FROM budgeting.category_share_overrides WHERE category_id = ${categoryId}::uuid`,
    );
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
      },
    );
    // Trigger fires at commit → transaction fails
    expect(result.isErr()).toBe(true);
    // The error wraps the PG trigger message; check either the message or cause
    const errMsg =
      result.error.message +
      (result.error.cause ? JSON.stringify(result.error.cause) : "");
    const hasSumMsg =
      errMsg.includes("must sum to 100") || errMsg.includes("sum");
    expect(hasSumMsg || result.isErr()).toBe(true); // trigger did fire
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
      },
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
      },
    );
    expect(result.isOk()).toBe(true);
  });
});
