/**
 * reserves.test.ts — Integration test for GET /budgets/:id/reserves
 * Requires real Postgres (DATABASE_URL_APP env).
 * Verifies that reserve balances are returned per-category after seeding limits + transactions.
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
    await client.query(`SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
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

async function seedLimit(budgetId: string, categoryId: string, plannedCents: number, effectiveFrom: string): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${budgetId}', true)`);
    await client.query(
      `INSERT INTO budgeting.category_limits
         (tenant_id, category_id, normal_amount, normal_currency, cushion_amount, cushion_currency, effective_from, actor_user_id)
       VALUES ($1, $2, $3, 'EUR', $3, 'EUR', $4::date, $1)`,
      [budgetId, categoryId, plannedCents, effectiveFrom],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedTransaction(budgetId: string, categoryId: string, date: string, amountCents: number): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${budgetId}', true)`);
    await client.query(
      `INSERT INTO budgeting.expense_ledger
         (tenant_id, budget_id, category_id, amount_original_cents, currency_original,
          amount_converted_cents, fx_rate, fx_as_of, transaction_date, kind, confirmed_at)
       VALUES ($1, $1, $2, $3, 'EUR', $3, 1.0, $4::date, $4::date, 'SPENDING', now())`,
      [budgetId, categoryId, amountCents, date],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function buildApp(userId: string, budgetId: string) {
  const { createReserveBalanceRepo } = await import(
    "@budget/budgeting/src/adapters/persistence/reserve-balance-repo"
  );
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");

  const reserveBalanceRepo = createReserveBalanceRepo();

  // Minimal deps stub — only budgeting.reserveBalanceRepo is needed for GET /:id/reserves
  const deps = {
    budgeting: {
      reserveBalanceRepo,
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
  // Inject session middleware (minimal stub)
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: userId } });
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
    // planned = 10000 cents, effective from 2026-04-01
    await seedLimit(fix.budgetId, fix.categoryId, 10000, "2026-04-01");
    // spending April: 3000 cents
    await seedTransaction(fix.budgetId, fix.categoryId, "2026-04-15", 3000);
    // App running today = 2026-05-12:
    // Apr: 10000 - 3000 = 7000; May: 7000 + 10000 = 17000 (no May spending)
    app = await buildApp(fix.userId, fix.budgetId);
  });

  it("returns 200 with per-category reserve balances", async () => {
    const res = await app.request(`/budgets/${fix.budgetId}/reserves`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.budgetId).toBe(fix.budgetId);
    expect(Array.isArray(body.reserves)).toBe(true);
    const entry = body.reserves.find((r: any) => r.categoryId === fix.categoryId);
    expect(entry).toBeDefined();
    // 17000 cents expected (Apr surplus 7000 + May full budget 10000)
    expect(entry.balanceCents).toBe("17000");
  });

  it("returns 401 without session", async () => {
    const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
    const { createReserveBalanceRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/reserve-balance-repo"
    );
    const noAuthApp = new Hono();
    const deps = {
      budgeting: { reserveBalanceRepo: createReserveBalanceRepo() },
      tenancy: { workspaceRepo: { listForUser: async () => [] }, memberShareRepo: { update: async () => {} } },
      identity: { auth: { api: {} }, userRepo: { setActiveWorkspaceIds: async () => {} } },
    } as any;
    // No session middleware — session will be null
    noAuthApp.route("/budgets", budgetsRoutesFactory(deps));
    const res = await noAuthApp.request(`/budgets/${fix.budgetId}/reserves`);
    expect(res.status).toBe(401);
  });
});
