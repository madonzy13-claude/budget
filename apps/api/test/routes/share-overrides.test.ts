/**
 * share-overrides.test.ts — Integration tests for share override API routes
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
  const email = `so-test-${userId.substring(0, 8)}@example.com`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at) VALUES ($1, $2, 'Test', true, now(), now())`,
      [userId, email],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at) VALUES ($1, $2, 'SO WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-so-${tenantId.slice(0, 8)}`, userId],
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

async function buildApp(userId: string, tenantId: string) {
  const { createCategoriesRoute } = await import("../../src/routes/categories");
  const { createShareOverridesRoute } =
    await import("../../src/routes/share-overrides");
  const { DrizzleCategoryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/category-repo");
  const { DrizzleShareOverrideRepo } =
    await import("@budget/budgeting/src/adapters/persistence/share-override-repo");
  const { createCategory } =
    await import("@budget/budgeting/src/application/create-category");
  const { archiveCategory } =
    await import("@budget/budgeting/src/application/archive-category");
  const { listCategories } =
    await import("@budget/budgeting/src/application/list-categories");
  const { findCategoryById } =
    await import("@budget/budgeting/src/application/find-category-by-id");
  const { renameCategory } =
    await import("@budget/budgeting/src/application/rename-category");
  const { setShareOverrides } =
    await import("@budget/budgeting/src/application/set-share-overrides");
  const { listShareOverrides } =
    await import("@budget/budgeting/src/application/list-share-overrides");

  const repo = new DrizzleCategoryRepo();
  const shareRepo = new DrizzleShareOverrideRepo();

  const deps = {
    budgeting: {
      createCategory: createCategory({ repo }),
      archiveCategory: archiveCategory({ repo }),
      listCategories: listCategories({ repo }),
      findCategoryById: findCategoryById({ repo }),
      renameCategory: renameCategory({ repo }),
      setShareOverrides: setShareOverrides({ shareRepo }),
      listShareOverrides: listShareOverrides({ shareRepo }),
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
  app.route("/categories", createShareOverridesRoute(deps));
  return app;
}

describe("PUT /categories/:id/share-overrides", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("sets valid overrides summing to 100% → 200", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const cat = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Share Cat", scope: "SHARED" }),
      })
    ).json();

    const userId2 = crypto.randomUUID();
    const res = await app.request(
      `/categories/${cat.category.id}/share-overrides`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            { userId: testUserId, percentage: "50" },
            { userId: userId2, percentage: "50" },
          ],
        }),
      },
    );
    expect(res.status).toBe(200);
  });

  it("returns 422 when overrides sum to ≠ 100%", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const cat = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bad Share Cat", scope: "SHARED" }),
      })
    ).json();

    const userId2 = crypto.randomUUID();
    const res = await app.request(
      `/categories/${cat.category.id}/share-overrides`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            { userId: testUserId, percentage: "60" },
            { userId: userId2, percentage: "30" },
          ],
        }),
      },
    );
    expect(res.status).toBe(422);
  });

  it("GET /categories/:id/share-overrides returns list", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const cat = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "List Share Cat", scope: "SHARED" }),
      })
    ).json();

    const userId2 = crypto.randomUUID();
    await app.request(`/categories/${cat.category.id}/share-overrides`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          { userId: testUserId, percentage: "70" },
          { userId: userId2, percentage: "30" },
        ],
      }),
    });

    const res = await app.request(
      `/categories/${cat.category.id}/share-overrides`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overrides).toHaveLength(2);
  });
});
