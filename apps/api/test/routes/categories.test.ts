/**
 * categories.test.ts — Integration tests for /categories routes
 * Uses real Postgres. TDD: written before full route implementation.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
// Substitute Docker hostname → localhost so the test runner can reach the DB.
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

let testUserId: string;
let testTenantId: string;

async function createTestUser(): Promise<{ userId: string; tenantId: string }> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DB_URL });
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const email = `cat-test-${userId.substring(0, 8)}@example.com`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at) VALUES ($1, $2, 'Test User', true, now(), now())`,
      [userId, email],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at) VALUES ($1, $2, 'Cat WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-cat-${tenantId.slice(0, 8)}`, userId],
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
  const { createCategoryLimitsRoute } =
    await import("../../src/routes/category-limits");
  const { createShareOverridesRoute } =
    await import("../../src/routes/share-overrides");
  const { DrizzleCategoryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/category-repo");
  const { DrizzleCategoryLimitRepo } =
    await import("@budget/budgeting/src/adapters/persistence/category-limit-repo");
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
  const { setCategoryLimit } =
    await import("@budget/budgeting/src/application/set-category-limit");
  const { getEffectiveLimit } =
    await import("@budget/budgeting/src/application/get-effective-limit");
  const { setShareOverrides } =
    await import("@budget/budgeting/src/application/set-share-overrides");
  const { listShareOverrides } =
    await import("@budget/budgeting/src/application/list-share-overrides");
  const { permanentlyDeleteCategory } =
    await import("@budget/budgeting/src/application/permanently-delete-category");
  const { unarchiveCategory } =
    await import("@budget/budgeting/src/application/unarchive-category");

  const repo = new DrizzleCategoryRepo();
  const limitRepo = new DrizzleCategoryLimitRepo();
  const shareRepo = new DrizzleShareOverrideRepo();

  const deps = {
    budgeting: {
      createCategory: createCategory({ repo }),
      archiveCategory: archiveCategory({ repo }),
      unarchiveCategory: unarchiveCategory({ repo, limitRepo }),
      permanentlyDeleteCategory: permanentlyDeleteCategory({ repo }),
      listCategories: listCategories({ repo }),
      findCategoryById: findCategoryById({ repo }),
      renameCategory: renameCategory({ repo }),
      setCategoryLimit: setCategoryLimit({ limitRepo }),
      getEffectiveLimit: getEffectiveLimit({ limitRepo }),
      setShareOverrides: setShareOverrides({ shareRepo }),
      listShareOverrides: listShareOverrides({ shareRepo }),
    },
  } as unknown as import("../../src/boot").BootedDeps;

  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", tenantId);
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/categories", createCategoriesRoute(deps));
  app.route("/categories", createCategoryLimitsRoute(deps));
  app.route("/categories", createShareOverridesRoute(deps));
  return app;
}

describe("POST /categories", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("creates root category → 201", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Housing", scope: "SHARED" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    // UAT Defect 2 fix: POST /categories now returns { category: CategoryDto }
    expect(body.category.name).toBe("Housing");
    expect(body.category.parentId).toBeNull();
    expect(body.category.archivedAt).toBeNull();
  });

  it("returns 422 when name is missing", async () => {
    // D-13: scope field dropped — invalid scope no longer causes 422 (field ignored).
    // Test renamed to verify missing-name validation still works.
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "SHARED" }), // missing required name
    });
    expect(res.status).toBe(422);
  });
});

describe("GET /categories", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("lists categories", async () => {
    const app = await buildApp(testUserId, testTenantId);
    // Create one first
    await app.request("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Transport", scope: "PERSONAL" }),
    });
    const res = await app.request("/categories");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.categories)).toBe(true);
  });
});

describe("POST /categories/:id/archive", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("archives a category", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const created = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Old Category", scope: "SHARED" }),
      })
    ).json();
    const res = await app.request(
      `/categories/${created.category.id}/archive`,
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archivedAt).not.toBeNull();
  });
});

describe("POST /categories/:id/limits", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("sets a limit → 201", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const created = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Groceries", scope: "SHARED" }),
      })
    ).json();

    const res = await app.request(`/categories/${created.category.id}/limits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        normalAmount: "50000",
        normalCurrency: "EUR",
        cushionAmount: "60000",
        cushionCurrency: "EUR",
        effectiveFrom: "2026-05-01",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.normalAmount).toBe("50000");
    expect(body.effectiveTo).toBeNull();
  });

  it("GET /categories/:id/limits/effective returns PIT limit", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const created = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Utilities", scope: "SHARED" }),
      })
    ).json();

    await app.request(`/categories/${created.category.id}/limits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        normalAmount: "30000",
        normalCurrency: "EUR",
        cushionAmount: "35000",
        cushionCurrency: "EUR",
        effectiveFrom: "2026-01-01",
      }),
    });

    const res = await app.request(
      `/categories/${created.category.id}/limits/effective?date=2026-06-01`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.normalAmount).toBe("30000");
  });
});

describe("POST /categories/:id/unarchive", () => {
  let localUserId: string;
  let localTenantId: string;

  beforeAll(async () => {
    const t = await createTestUser();
    localUserId = t.userId;
    localTenantId = t.tenantId;
  });

  it("unarchives a kept-history archived category → 200 + archivedAt null", async () => {
    const app = await buildApp(localUserId, localTenantId);
    // Create a category
    const created = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Unarchive Me", scope: "SHARED" }),
      })
    ).json();
    const catId = created.category.id;

    // Archive as "keep history" (current_future mode)
    const archiveRes = await app.request(`/categories/${catId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "current_future" }),
    });
    expect(archiveRes.status).toBe(200);

    // Unarchive
    const res = await app.request(`/categories/${catId}/unarchive`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archivedAt).toBeNull();
    expect(body.id).toBe(catId);
  });

  it("tenant-mismatch budgetId → 403", async () => {
    const app = await buildApp(localUserId, localTenantId);
    const created = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Another Cat", scope: "SHARED" }),
      })
    ).json();
    const catId = created.category.id;

    // Build an app with a DIFFERENT tenantId to simulate cross-tenant request
    const other = await createTestUser();
    const otherApp = await buildApp(other.userId, other.tenantId);

    // Mount with budgetId param mismatch by routing under /budgets/:budgetId
    const mismatchApp = new (await import("hono")).Hono();
    mismatchApp.use(async (c, next) => {
      c.set("session", { user: { id: other.userId } });
      c.set("tenantId", other.tenantId);
      c.set("tenantIds", [other.tenantId]);
      c.set("userId", other.userId);
      await next();
    });
    const { createCategoriesRoute } = await import("../../src/routes/categories");
    const { DrizzleCategoryRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/category-repo"
    );
    const { DrizzleCategoryLimitRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/category-limit-repo"
    );
    const { unarchiveCategory } = await import(
      "@budget/budgeting/src/application/unarchive-category"
    );
    const { permanentlyDeleteCategory } = await import(
      "@budget/budgeting/src/application/permanently-delete-category"
    );
    const { archiveCategory } = await import(
      "@budget/budgeting/src/application/archive-category"
    );
    const { createCategory } = await import(
      "@budget/budgeting/src/application/create-category"
    );
    const { listCategories } = await import(
      "@budget/budgeting/src/application/list-categories"
    );
    const { findCategoryById } = await import(
      "@budget/budgeting/src/application/find-category-by-id"
    );
    const { renameCategory } = await import(
      "@budget/budgeting/src/application/rename-category"
    );
    const { setCategoryLimit } = await import(
      "@budget/budgeting/src/application/set-category-limit"
    );
    const { getEffectiveLimit } = await import(
      "@budget/budgeting/src/application/get-effective-limit"
    );
    const { setShareOverrides } = await import(
      "@budget/budgeting/src/application/set-share-overrides"
    );
    const { listShareOverrides } = await import(
      "@budget/budgeting/src/application/list-share-overrides"
    );
    const r2 = new DrizzleCategoryRepo();
    const l2 = new DrizzleCategoryLimitRepo();
    const mismatchDeps = {
      budgeting: {
        createCategory: createCategory({ repo: r2 }),
        archiveCategory: archiveCategory({ repo: r2 }),
        unarchiveCategory: unarchiveCategory({ repo: r2, limitRepo: l2 }),
        permanentlyDeleteCategory: permanentlyDeleteCategory({ repo: r2 }),
        listCategories: listCategories({ repo: r2 }),
        findCategoryById: findCategoryById({ repo: r2 }),
        renameCategory: renameCategory({ repo: r2 }),
        setCategoryLimit: setCategoryLimit({ limitRepo: l2 }),
        getEffectiveLimit: getEffectiveLimit({ limitRepo: l2 }),
        setShareOverrides: setShareOverrides({
          shareRepo: new (await import("@budget/budgeting/src/adapters/persistence/share-override-repo")).DrizzleShareOverrideRepo(),
        }),
        listShareOverrides: listShareOverrides({
          shareRepo: new (await import("@budget/budgeting/src/adapters/persistence/share-override-repo")).DrizzleShareOverrideRepo(),
        }),
      },
    } as unknown as import("../../src/boot").BootedDeps;
    // Production mount pattern — :budgetId param so the route guard can read it.
    mismatchApp.route(
      "/budgets/:budgetId/categories",
      createCategoriesRoute(mismatchDeps),
    );

    const res = await mismatchApp.request(
      `/budgets/${localTenantId}/categories/${catId}/unarchive`,
      { method: "POST" },
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 when category is not archived", async () => {
    const app = await buildApp(localUserId, localTenantId);
    const created = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Not Archived", scope: "SHARED" }),
      })
    ).json();
    const res = await app.request(
      `/categories/${created.category.id}/unarchive`,
      { method: "POST" },
    );
    expect(res.status).toBe(422);
  });
});

describe("PUT /categories/:id/share-overrides", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("sets overrides summing to 100% → 200", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const created = await (
      await app.request("/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Share Cat", scope: "SHARED" }),
      })
    ).json();

    const userId2 = crypto.randomUUID();
    const res = await app.request(
      `/categories/${created.category.id}/share-overrides`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            { userId: testUserId, percentage: "60" },
            { userId: userId2, percentage: "40" },
          ],
        }),
      },
    );
    expect(res.status).toBe(200);
  });
});
