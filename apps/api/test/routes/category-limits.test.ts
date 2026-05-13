/**
 * category-limits.test.ts — Integration tests for category limits API
 * Focuses on SCD-2 effective-dated behavior via HTTP routes.
 * Phase 4 addendum (plan 04-02): concurrent SCD-2 advisory lock test (Pitfall 3).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) throw new Error("DATABASE_URL_APP required");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

let testUserId: string;
let testTenantId: string;

async function createTestUser(): Promise<{ userId: string; tenantId: string }> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DB_URL });
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const email = `lmt-test-${userId.substring(0, 8)}@example.com`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at) VALUES ($1, $2, 'Test', true, now(), now())`, [userId, email]);
    await client.query(`INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at) VALUES ($1, $2, 'Lmt WS', 'PRIVATE', 'EUR', $3, 1, now())`, [tenantId, `ws-lmt-${tenantId.slice(0, 8)}`, userId]);
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

async function buildApp(userId: string, tenantId: string) {
  const { createCategoriesRoute } = await import("../../src/routes/categories");
  const { createCategoryLimitsRoute } = await import("../../src/routes/category-limits");
  const { DrizzleCategoryRepo } = await import("@budget/budgeting/src/adapters/persistence/category-repo");
  const { DrizzleCategoryLimitRepo } = await import("@budget/budgeting/src/adapters/persistence/category-limit-repo");
  const { createCategory } = await import("@budget/budgeting/src/application/create-category");
  const { archiveCategory } = await import("@budget/budgeting/src/application/archive-category");
  const { listCategories } = await import("@budget/budgeting/src/application/list-categories");
  const { findCategoryById } = await import("@budget/budgeting/src/application/find-category-by-id");
  const { renameCategory } = await import("@budget/budgeting/src/application/rename-category");
  const { setCategoryLimit } = await import("@budget/budgeting/src/application/set-category-limit");
  const { getEffectiveLimit } = await import("@budget/budgeting/src/application/get-effective-limit");

  const repo = new DrizzleCategoryRepo();
  const limitRepo = new DrizzleCategoryLimitRepo();

  const deps = {
    budgeting: {
      createCategory: createCategory({ repo }),
      archiveCategory: archiveCategory({ repo }),
      listCategories: listCategories({ repo }),
      findCategoryById: findCategoryById({ repo }),
      renameCategory: renameCategory({ repo }),
      setCategoryLimit: setCategoryLimit({ limitRepo }),
      getEffectiveLimit: getEffectiveLimit({ limitRepo }),
    },
  } as unknown as import("../../src/boot").BootedDeps;

  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/categories", createCategoriesRoute(deps));
  app.route("/categories", createCategoryLimitsRoute(deps));
  return app;
}

describe("Category limits SCD-2 via HTTP", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("set initial limit (Jan 1) then update (May 1) — effective lookup returns correct row", async () => {
    const app = await buildApp(testUserId, testTenantId);

    // Create category
    const catRes = await app.request("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Housing SCD2", scope: "SHARED" }),
    });
    const cat = await catRes.json();

    // Set Jan 1 limit
    await app.request(`/categories/${cat.id}/limits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        normalAmount: "100000",
        normalCurrency: "EUR",
        cushionAmount: "110000",
        cushionCurrency: "EUR",
        effectiveFrom: "2026-01-01",
      }),
    });

    // Set May 1 limit (closes Jan row)
    await app.request(`/categories/${cat.id}/limits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        normalAmount: "120000",
        normalCurrency: "EUR",
        cushionAmount: "130000",
        cushionCurrency: "EUR",
        effectiveFrom: "2026-05-01",
      }),
    });

    // Apr lookup → Jan limit
    const aprRes = await app.request(`/categories/${cat.id}/limits/effective?date=2026-04-30`);
    const apr = await aprRes.json();
    expect(apr.normalAmount).toBe("100000");

    // May lookup → May limit
    const mayRes = await app.request(`/categories/${cat.id}/limits/effective?date=2026-05-01`);
    const may = await mayRes.json();
    expect(may.normalAmount).toBe("120000");
  });

  it("returns 404 for category with no limits", async () => {
    const app = await buildApp(testUserId, testTenantId);

    const catRes = await app.request("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Limit Cat", scope: "SHARED" }),
    });
    const cat = await catRes.json();

    const res = await app.request(`/categories/${cat.id}/limits/effective`);
    expect(res.status).toBe(404);
  });

  it("concurrent SCD-2 writes do not produce overlapping open rows (Pitfall 3 advisory lock)", async () => {
    // Create a fresh tenant + category to isolate from other tests
    const t2 = await createTestUser();
    const app = await buildApp(t2.userId, t2.tenantId);

    const catRes = await app.request("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Concurrent Limit Cat", scope: "SHARED" }),
    });
    const cat = await catRes.json();

    // Fire 3 concurrent limit-sets for different effective dates.
    // The advisory lock in category-limit-repo ensures only one open row exists.
    await Promise.all([
      app.request(`/categories/${cat.id}/limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          normalAmount: "10000",
          normalCurrency: "EUR",
          cushionAmount: "11000",
          cushionCurrency: "EUR",
          effectiveFrom: "2026-01-01",
        }),
      }),
      app.request(`/categories/${cat.id}/limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          normalAmount: "20000",
          normalCurrency: "EUR",
          cushionAmount: "22000",
          cushionCurrency: "EUR",
          effectiveFrom: "2026-03-01",
        }),
      }),
      app.request(`/categories/${cat.id}/limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          normalAmount: "30000",
          normalCurrency: "EUR",
          cushionAmount: "33000",
          cushionCurrency: "EUR",
          effectiveFrom: "2026-06-01",
        }),
      }),
    ]);

    // After concurrent writes: no overlapping open rows (effective_to IS NULL count = 1)
    // Use app_role with explicit tenant RLS context for the verification query
    const { Pool } = await import("pg");
    const verifyPool = new Pool({ connectionString: DB_URL });
    const verifyClient = await verifyPool.connect();
    let openCount = -1;
    try {
      await verifyClient.query(`BEGIN`);
      await verifyClient.query(`SELECT set_config('app.tenant_ids', $1, false)`, [`{"${t2.tenantId}"}`]);
      await verifyClient.query(`SELECT set_config('app.current_user_id', $1, false)`, [t2.userId]);
      const { rows } = await verifyClient.query(
        `SELECT count(*) AS open_count
           FROM budgeting.category_limits
          WHERE tenant_id = $1::uuid
            AND category_id = $2::uuid
            AND effective_to IS NULL`,
        [t2.tenantId, cat.id],
      );
      await verifyClient.query(`COMMIT`);
      openCount = Number(rows[0].open_count);
    } finally {
      verifyClient.release();
      await verifyPool.end();
    }
    expect(openCount).toBe(1);
  });
});
