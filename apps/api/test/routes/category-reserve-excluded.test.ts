/**
 * category-reserve-excluded.test.ts — Integration tests for
 * PATCH /budgets/:budgetId/categories/:categoryId/reserve-excluded.
 *
 * W-2 disambiguation: two distinct failure paths tested separately:
 *   Path 1 (404): categoryId belongs to a foreign tenant → use case findById returns null via predicate → 404
 *   Path 2 (403): URL budgetId doesn't match caller's tenantId → route guard fires BEFORE use case → 403
 *
 * TDD: written before route implementation.
 * Real Postgres, no DB mocks.
 * RSRV-05, RSRV-06, T-05-04.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  budgetId: string;
  categoryId: string;
}

async function createFixture(label = "cat-excl"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'CatExcl Test', true, now(), now())`,
      [userId, `${label}-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'CatExcl Budget', 'PRIVATE', 'EUR', $3, 1, now())`,
      [budgetId, `ce-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Excl Test Cat', now(), $3)`,
      [categoryId, budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId, categoryId };
}

/**
 * Build a Hono app for the categories route, mounted under /budgets/:budgetId/categories.
 * The categories route is mounted with budgetId param available.
 */
async function buildApp(userId: string, tenantId: string) {
  const { createCategoriesRoute } = await import("../../src/routes/categories");
  const { DrizzleCategoriesRepo } =
    await import("@budget/budgeting/src/adapters/persistence/categories-repo");
  const { toggleCategoryReserveExcluded } =
    await import("@budget/budgeting/src/application/toggle-category-reserve-excluded");

  const categoriesRepo = new DrizzleCategoriesRepo();
  const deps = {
    budgeting: {
      // Existing stubs for the route (not under test)
      createCategory: async () => ({ isErr: () => false, value: {} }),
      archiveCategory: async () => ({ isErr: () => false }),
      listCategories: async () => ({ isErr: () => false, value: [] }),
      findCategoryById: async () => ({ isErr: () => false, value: null }),
      renameCategory: async () => ({ isErr: () => false, value: {} }),
      reorderCategories: async () => ({ isErr: () => false }),
      toggleCategoryReserveExcluded: toggleCategoryReserveExcluded({
        repo: categoriesRepo,
      }),
    },
  } as any;

  const app = new Hono();
  app.use("*", async (c: any, next: any) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  // Mount under /budgets/:budgetId/categories — same as production mount
  app.route("/budgets/:budgetId/categories", createCategoriesRoute(deps));
  return app;
}

describe("PATCH /budgets/:budgetId/categories/:id/reserve-excluded", () => {
  let fixA: Fixture;
  let fixB: Fixture;
  let appA: Hono;

  beforeAll(async () => {
    fixA = await createFixture("cat-excl-A");
    fixB = await createFixture("cat-excl-B");
    appA = await buildApp(fixA.userId, fixA.budgetId);
  });

  it("200 toggle false→true: row updated", async () => {
    const res = await appA.request(
      `/budgets/${fixA.budgetId}/categories/${fixA.categoryId}/reserve-excluded`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded: true }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.reserveExcluded).toBe(true);
    expect(body.categoryId).toBe(fixA.categoryId);
  });

  it("200 toggle true→false: row updated back", async () => {
    // First set to true
    await appA.request(
      `/budgets/${fixA.budgetId}/categories/${fixA.categoryId}/reserve-excluded`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded: true }),
      },
    );
    // Then toggle back to false
    const res = await appA.request(
      `/budgets/${fixA.budgetId}/categories/${fixA.categoryId}/reserve-excluded`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded: false }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.reserveExcluded).toBe(false);
  });

  it("404 foreign-category (W-2 path 1): categoryId belongs to foreign tenant, URL budgetId matches caller", async () => {
    // Caller is tenantA, budgetId in URL is tenantA (so route guard passes)
    // But categoryId belongs to tenantB (different tenant) → use case predicate returns null → 404
    const res = await appA.request(
      `/budgets/${fixA.budgetId}/categories/${fixB.categoryId}/reserve-excluded`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded: true }),
      },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toBe("not_found");
  });

  it("403 foreign-budget-URL (W-2 path 2): URL budgetId doesn't match caller tenantId → route guard fires BEFORE use case", async () => {
    // Caller's tenantId is fixA.budgetId, but URL budgetId is fixB.budgetId
    // Route guard: budgetId (fixB) !== pickTenant(c) (fixA) → 403 tenant_mismatch
    const res = await appA.request(
      `/budgets/${fixB.budgetId}/categories/${fixA.categoryId}/reserve-excluded`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded: true }),
      },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("tenant_mismatch");
  });
});
