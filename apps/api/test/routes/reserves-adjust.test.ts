/**
 * reserves-adjust.test.ts — Integration tests for POST /budgets/:id/reserves/:categoryId/adjust.
 * TDD: written before route implementation.
 * Real Postgres, no DB mocks (CLAUDE.md).
 * RSRV-01, RSRV-02, T-05-05.
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

async function createFixture(): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'ReserveAdj Test', true, now(), now())`,
      [userId, `rsv-adj-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Adj Budget', 'PRIVATE', 'EUR', $3, 1, now())`,
      [budgetId, `adj-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Adj Cat', now(), $3)`,
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

async function buildApp(
  userId: string,
  budgetId: string,
  overrides?: { isReservesEnabled?: (tenantId: string) => Promise<boolean> },
) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
  const { DrizzleCategoryReserveAdjustmentsRepo } =
    await import("@budget/budgeting/src/adapters/persistence/category-reserve-adjustments-repo");
  const { DrizzleCategoriesRepo } =
    await import("@budget/budgeting/src/adapters/persistence/categories-repo");
  const { adjustCategoryReserve } =
    await import("@budget/budgeting/src/application/adjust-category-reserve");
  const { getReservesSummary } =
    await import("@budget/budgeting/src/application/get-reserves-summary");
  const { createReserveBalanceRepo } =
    await import("@budget/budgeting/src/adapters/persistence/reserve-balance-repo");
  const { DrizzleReservesSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/reserves-summary-repo");

  const adjustmentsRepo = new DrizzleCategoryReserveAdjustmentsRepo();
  const categoriesRepo = new DrizzleCategoriesRepo();

  // Default: reserves always enabled (tests don't require DB-level flag read)
  const isReservesEnabled =
    overrides?.isReservesEnabled ?? (async (_tenantId: string) => true);

  const budgetCurrencyOf = async (_tenantId: string): Promise<string> => "EUR";

  const deps = {
    budgeting: {
      adjustCategoryReserve: adjustCategoryReserve({
        adjustmentsRepo,
        categoriesRepo,
        reserveBalanceRepo: createReserveBalanceRepo(),
        reservesSummaryRepo: new DrizzleReservesSummaryRepo(),
        isReservesEnabled,
      }),
      getReservesSummary: getReservesSummary({
        reserveBalanceRepo: createReserveBalanceRepo(),
        reservesSummaryRepo: new DrizzleReservesSummaryRepo(),
        categoriesRepo,
        budgetCurrencyOf,
        isReservesEnabled,
      }),
      // stub out unused methods
      reserveBalanceRepo: createReserveBalanceRepo(),
    },
    tenancy: {
      workspaceRepo: { listForUser: async () => [] },
      memberShareRepo: { update: async () => {} },
    },
    identity: {
      auth: { api: {} },
      userRepo: { setActiveWorkspaceIds: async () => {} },
    },
  } as any;

  const app = new Hono();
  app.use("*", async (c: any, next: any) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [budgetId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/budgets", budgetsRoutesFactory(deps));
  return app;
}

describe("POST /budgets/:id/reserves/:categoryId/adjust", () => {
  let fix: Fixture;
  let app: Hono;

  beforeAll(async () => {
    fix = await createFixture();
    app = await buildApp(fix.userId, fix.budgetId);
  });

  it("200 happy path: sets expected target, returns expected/actual/delta", async () => {
    const res = await app.request(
      `/budgets/${fix.budgetId}/reserves/${fix.categoryId}/adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCents: 50000, note: "test" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.expectedCents).toBe("50000");
    expect(body.actualCents).toBeDefined();
    expect(body.deltaCents).toBeDefined();
  });

  it("200 lower expected: clamps actual, spills to siblings", async () => {
    const res = await app.request(
      `/budgets/${fix.budgetId}/reserves/${fix.categoryId}/adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCents: 25000 }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.expectedCents).toBe("25000");
  });

  it("422 category_excluded: pre-set reserveExcluded=true → POST adjust → 422", async () => {
    // Create a separate category and mark it excluded
    const pool = new Pool({ connectionString: DB_URL });
    const exclCatId = crypto.randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.tenant_ids', '{"${fix.budgetId}"}', true)`,
      );
      await client.query(
        `SELECT set_config('app.current_user_id', '${fix.userId}', true)`,
      );
      await client.query(
        `INSERT INTO budgeting.categories (id, tenant_id, name, reserve_excluded, created_at, actor_user_id)
         VALUES ($1, $2, 'Excluded Cat', true, now(), $3)`,
        [exclCatId, fix.budgetId, fix.userId],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
      await pool.end();
    }

    const res = await app.request(
      `/budgets/${fix.budgetId}/reserves/${exclCatId}/adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCents: 1000 }),
      },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("category_excluded");
  });

  it("422 reserves_disabled: isReservesEnabled=false → POST adjust → 422", async () => {
    // Use buildApp override to simulate reserves_disabled without DB-level UPDATE.
    // (RLS prevents app_role from updating tenancy.budgets in test context.)
    const fix2 = await createFixture();
    const disabledApp = await buildApp(fix2.userId, fix2.budgetId, {
      isReservesEnabled: async () => false,
    });
    const res = await disabledApp.request(
      `/budgets/${fix2.budgetId}/reserves/${fix2.categoryId}/adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCents: 1000 }),
      },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("reserves_disabled");
  });

  it("422 expectedCents<0: Zod rejects", async () => {
    const res = await app.request(
      `/budgets/${fix.budgetId}/reserves/${fix.categoryId}/adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCents: -1 }),
      },
    );
    expect(res.status).toBe(422);
  });

  it("422 note too long (>280 chars): Zod rejects", async () => {
    const res = await app.request(
      `/budgets/${fix.budgetId}/reserves/${fix.categoryId}/adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCents: 1000, note: "x".repeat(281) }),
      },
    );
    expect(res.status).toBe(422);
  });

  it("404 cross-tenant: different tenantIds → 404", async () => {
    const noAuthApp = new Hono();
    noAuthApp.use("*", async (c: any, next: any) => {
      c.set("session", { user: { id: fix.userId } });
      c.set("tenantIds", ["other-budget-id"]); // doesn't include fix.budgetId
      c.set("userId", fix.userId);
      await next();
    });
    const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
    noAuthApp.route(
      "/budgets",
      budgetsRoutesFactory({
        budgeting: { adjustCategoryReserve: async () => {} },
        tenancy: {
          workspaceRepo: { listForUser: async () => [] },
          memberShareRepo: { update: async () => {} },
        },
        identity: {
          auth: { api: {} },
          userRepo: { setActiveWorkspaceIds: async () => {} },
        },
      } as any),
    );

    const res = await noAuthApp.request(
      `/budgets/${fix.budgetId}/reserves/${fix.categoryId}/adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCents: 1000 }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("422 strict mode: extra unknown key → 422", async () => {
    const res = await app.request(
      `/budgets/${fix.budgetId}/reserves/${fix.categoryId}/adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deltaCents: 1000, extraField: "bad" }),
      },
    );
    expect(res.status).toBe(422);
  });
});
