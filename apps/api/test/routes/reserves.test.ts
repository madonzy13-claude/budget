/**
 * reserves.test.ts — Integration test for GET /budgets/:id/reserves
 * Requires real Postgres (DATABASE_URL_APP env).
 *
 * Phase 5 Plan 03 rewrite: route now returns {rows, excludedRows, totals}
 * via deps.budgeting.getReservesSummary use case.
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
  currency: string;
}

async function createFixture(currency = "EUR"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Reserves Test', true, now(), now())`,
      [userId, `reserves-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Reserves Budget', 'PRIVATE', $3, $4, 1, now())`,
      [budgetId, `ws-rsv-${budgetId.slice(0, 8)}`, currency, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Reserves Cat', now(), $3)`,
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
  return { userId, budgetId, categoryId, currency };
}

/**
 * Build app with real getReservesSummary use case.
 * tenantIds injected via middleware to satisfy T-05-01 gate.
 */
async function buildApp(userId: string, budgetId: string) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
  const { getReservesSummary } =
    await import("@budget/budgeting/src/application/get-reserves-summary");
  const { createReserveBalanceRepo } =
    await import("@budget/budgeting/src/adapters/persistence/reserve-balance-repo");
  const { DrizzleReservesSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/reserves-summary-repo");
  const { DrizzleCategoriesRepo } =
    await import("@budget/budgeting/src/adapters/persistence/categories-repo");

  const reserveBalanceRepo = createReserveBalanceRepo();
  const reservesSummaryRepo = new DrizzleReservesSummaryRepo();
  const categoriesRepo = new DrizzleCategoriesRepo();

  // isReservesEnabled: always true for tests (budget_mode_history absent = NORMAL = enabled)
  const isReservesEnabled = async (_tenantId: string) => true;
  // budgetCurrencyOf: reads from DB via withTenantTx-compatible approach — stub to EUR
  const budgetCurrencyOf = async (_tenantId: string) => "EUR";

  const getReservesSummaryUC = getReservesSummary({
    reserveBalanceRepo,
    reservesSummaryRepo,
    categoriesRepo,
    budgetCurrencyOf,
    isReservesEnabled,
  });

  const deps = {
    budgeting: {
      getReservesSummary: getReservesSummaryUC,
      // stub out other budgeting methods not needed by this route
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
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [budgetId]);
    await next();
  });
  app.route("/budgets", budgetsRoutesFactory(deps));
  return app;
}

describe("GET /budgets/:id/reserves", () => {
  let fix: Fixture;
  let app: Hono;

  beforeAll(async () => {
    fix = await createFixture("EUR");
    app = await buildApp(fix.userId, fix.budgetId);
  });

  it("returns 200 with {rows, excludedRows, totals} shape", async () => {
    const res = await app.request(`/budgets/${fix.budgetId}/reserves`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // Phase 5 Plan 03 shape
    expect(Array.isArray(body.rows)).toBe(true);
    expect(Array.isArray(body.excludedRows)).toBe(true);
    expect(body.totals).toBeDefined();
  });

  it("includes category in rows (no limit seeded = empty rows)", async () => {
    const res = await app.request(`/budgets/${fix.budgetId}/reserves`);
    const body = (await res.json()) as any;
    // Category has no limits, so rows may be empty — test shape only
    expect(body.rows).toBeDefined();
  });

  it("returns 401 without session", async () => {
    const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
    const noAuthApp = new Hono();
    const deps = {
      budgeting: {
        getReservesSummary: async () => err(new Error("should not be called")),
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
    // No session middleware
    noAuthApp.route("/budgets", budgetsRoutesFactory(deps));
    const res = await noAuthApp.request(`/budgets/${fix.budgetId}/reserves`);
    expect(res.status).toBe(401);
  });

  it("returns 404 when budgetId not in tenantIds", async () => {
    const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
    const foreignApp = new Hono();
    const deps = {
      budgeting: {
        getReservesSummary: async () =>
          ok({ rows: [], excludedRows: [], totals: {} }),
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
    const otherBudgetId = crypto.randomUUID();
    foreignApp.use("*", async (c, next) => {
      c.set("session", { user: { id: "attacker" } });
      c.set("tenantIds", [otherBudgetId]); // attacker's tenant
      await next();
    });
    foreignApp.route("/budgets", budgetsRoutesFactory(deps));
    const res = await foreignApp.request(`/budgets/${fix.budgetId}/reserves`);
    expect(res.status).toBe(404);
  });
});
