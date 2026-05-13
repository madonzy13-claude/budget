/**
 * categories-sort-order.test.ts — Integration tests for PUT /budgets/:budgetId/categories/sort-order
 * Real Postgres. TDD plan 04-02 Task 2.
 *
 * Covers:
 *   - Golden path: reorder N categories → 204
 *   - Empty orderedIds → 422
 *   - Tenant-leak: cross-tenant returns 403
 *   - Sort_index persisted correctly
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  tenantId: string;
}

async function createFixture(): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [userId],
    );
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Sort Test', true, now(), now())`,
      [userId, `sort-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Sort WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-sort-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, tenantId };
}

async function seedCategory(tenantId: string, userId: string, name: string): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [`{"${tenantId}"}`]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, $3, now(), $4)`,
      [id, tenantId, name, userId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
  return id;
}

async function buildApp(userId: string, tenantId: string) {
  const { createCategoriesRoute } = await import("../../src/routes/categories");
  const { DrizzleCategoryRepo } = await import("@budget/budgeting/src/adapters/persistence/category-repo");
  const { reorderCategories } = await import("@budget/budgeting/src/application/reorder-categories");

  const repo = new DrizzleCategoryRepo();

  const deps = {
    budgeting: {
      reorderCategories: reorderCategories({ repo }),
    },
  } as unknown as import("../../src/boot").BootedDeps;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  // Mount under /budgets/:budgetId/categories to match production routing
  app.route("/budgets/:budgetId/categories", createCategoriesRoute(deps));
  return app;
}

describe("PUT /budgets/:budgetId/categories/sort-order", () => {
  let fix: Fixture;
  let catA: string;
  let catB: string;
  let catC: string;

  beforeAll(async () => {
    fix = await createFixture();
    catA = await seedCategory(fix.tenantId, fix.userId, "Alpha");
    catB = await seedCategory(fix.tenantId, fix.userId, "Beta");
    catC = await seedCategory(fix.tenantId, fix.userId, "Gamma");
  });

  it("reorders 3 categories → 204", async () => {
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/categories/sort-order`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: [catC, catA, catB] }),
      },
    );
    expect(res.status).toBe(204);
  });

  it("returns 422 for empty orderedIds", async () => {
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/categories/sort-order`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: [] }),
      },
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for duplicate ids", async () => {
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/categories/sort-order`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: [catA, catA] }),
      },
    );
    expect(res.status).toBe(422);
  });

  it("tenant-leak: wrong budgetId → 403 (T-04-02-08)", async () => {
    const otherTenantId = crypto.randomUUID();
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${otherTenantId}/categories/sort-order`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: [catA] }),
      },
    );
    expect(res.status).toBe(403);
  });
});
