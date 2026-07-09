/**
 * overview-overspent.test.ts — Integration test for
 * GET /budgets/:id/overview/overspent-reserves (Phase 11 Plan 11-05, D-10/D-06).
 *
 * Real Postgres, real overview-repo + real reserve engine (createBudgetingModule
 * reservePositions + getReservesSummary). Exercises:
 *   - after-reserves overspent summed across the range (OVER overspends 2 of 3
 *     months; never-overspending SAVER excluded),
 *   - overspent-by-category descending, >0 only,
 *   - archived "keep history" (ARCH archived mid-Feb) contributes Jan+Feb only —
 *     its huge March spend is ignored (D-06),
 *   - reserves-by-category passthrough from the engine (rows present),
 *   - default_currency, Zod range guard, cross-tenant 404.
 *
 * The exact reserve-draw arithmetic is covered by the unit test; here the reserve
 * engine runs against real DB so reserve_used flows through the real seam.
 * NO DB mocking.
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
  saverId: string;
  overId: string;
  archId: string;
}

async function withTenant<T>(
  budgetId: string,
  userId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedLimit(
  c: import("pg").PoolClient,
  budgetId: string,
  userId: string,
  categoryId: string,
  normalCents: number,
) {
  await c.query(
    `INSERT INTO budgeting.category_limits
       (id, tenant_id, category_id, normal_amount, normal_currency,
        cushion_amount, cushion_currency, effective_from, actor_user_id, created_at)
     VALUES ($1, $2, $3, $4, 'USD', $4, 'USD', '2026-01-01', $5, now())`,
    [crypto.randomUUID(), budgetId, categoryId, normalCents, userId],
  );
}

async function seedSpend(
  c: import("pg").PoolClient,
  budgetId: string,
  categoryId: string,
  date: string,
  cents: number,
) {
  await c.query(
    `INSERT INTO budgeting.expense_ledger
       (id, tenant_id, budget_id, category_id, currency_original, amount_original_cents,
        amount_converted_cents, fx_rate, fx_as_of, transaction_date, kind, confirmed_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'USD', $5, $5, 1, $6::date, $6::date, 'SPENDING', now(), now(), now())`,
    [crypto.randomUUID(), budgetId, budgetId, categoryId, cents, date],
  );
}

async function createFixture(): Promise<Fixture> {
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const saverId = crypto.randomUUID();
  const overId = crypto.randomUUID();
  const archId = crypto.randomUUID();

  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Overspent Test', true, now(), now())`,
      [userId, `over-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, reserves_enabled, created_at)
       VALUES ($1, $2, 'Overspent Budget', 'PRIVATE', 'USD', $3, 1, true, now())`,
      [budgetId, `ws-ov-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  await withTenant(budgetId, userId, async (c) => {
    // SAVER — never overspends; under-spends each closed month → accrues reserve.
    await c.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Saver', '2025-12-01T00:00:00Z', $3)`,
      [saverId, budgetId, userId],
    );
    // OVER — overspends Jan + Feb (no reserve, never accrues).
    await c.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Over', '2025-12-01T00:00:00Z', $3)`,
      [overId, budgetId, userId],
    );
    // ARCH — overspends Jan + Feb, archived "keep history" mid-Feb → no March.
    await c.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, archived_from, actor_user_id)
       VALUES ($1, $2, 'Archived', '2025-12-01T00:00:00Z', '2026-02-15T00:00:00Z', $3)`,
      [archId, budgetId, userId],
    );

    await seedLimit(c, budgetId, userId, saverId, 10000);
    await seedLimit(c, budgetId, userId, overId, 20000);
    await seedLimit(c, budgetId, userId, archId, 10000);

    // OVER: Jan over 50, Feb over 80, Mar exactly on limit (0).
    await seedSpend(c, budgetId, overId, "2026-01-10", 25000);
    await seedSpend(c, budgetId, overId, "2026-02-10", 28000);
    await seedSpend(c, budgetId, overId, "2026-03-10", 20000);
    // ARCH: Jan over 100, Feb over 50, Mar 999.00 MUST be ignored (archived).
    await seedSpend(c, budgetId, archId, "2026-01-10", 20000);
    await seedSpend(c, budgetId, archId, "2026-02-10", 15000);
    await seedSpend(c, budgetId, archId, "2026-03-10", 99900);
    // SAVER: no spend → under-spends each month.
  });

  return { userId, budgetId, saverId, overId, archId };
}

async function buildApp(opts: { userId: string; allowedTenantIds: string[] }) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
  const { getOverviewOverspent } =
    await import("@budget/budgeting/src/application/get-overview-overspent");
  const { createOverviewRepo } =
    await import("@budget/budgeting/src/adapters/persistence/overview-repo");
  const { createBudgetHomeSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/budget-home-summary-repo");
  const { createBudgetingModule } =
    await import("@budget/budgeting/src/contracts/factory");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
  const { workerPool } = await import("@budget/platform");

  const mod = createBudgetingModule({
    fxCache: new DrizzleFxRateCacheRepo(workerPool()),
  });
  const getOverviewOverspentUC = getOverviewOverspent({
    overviewRepo: createOverviewRepo(),
    reservePositions: mod.reservePositions,
    reservesSummary: mod.getReservesSummary,
    metaReader: createBudgetHomeSummaryRepo(),
  });

  const deps = {
    budgeting: { getOverviewOverspent: getOverviewOverspentUC },
    tenancy: {
      workspaceRepo: { listForUser: async () => [] },
      memberShareRepo: { update: async () => {} },
    },
    identity: {
      auth: { api: {} },
      userRepo: { setActiveWorkspaceIds: async () => {} },
    },
  } as never;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: opts.userId } });
    c.set("tenantIds", opts.allowedTenantIds);
    await next();
  });
  app.route("/budgets", budgetsRoutesFactory(deps));
  return app;
}

describe("GET /budgets/:id/overview/overspent-reserves", () => {
  let fix: Fixture;
  let other: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
    other = await createFixture();
  });

  it("after-reserves overspent: range total + by-category desc/>0; archived in-history (D-10/D-06)", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/overspent-reserves?from=2026-01-01&to=2026-03-31`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      currency: string;
      overspent_total_cents: string;
      overspent_by_category: {
        category_id: string;
        name: string;
        overspent_cents: string;
      }[];
      reserves_by_category: {
        category_id: string;
        name: string;
        reserve_cents: string;
      }[];
    };
    expect(body.currency).toBe("USD");
    // ARCH 10000+5000=15000 (March ignored), OVER 5000+8000=13000 → desc
    expect(body.overspent_by_category).toEqual([
      { category_id: fix.archId, name: "Archived", overspent_cents: "15000" },
      { category_id: fix.overId, name: "Over", overspent_cents: "13000" },
    ]);
    expect(body.overspent_total_cents).toBe("28000");
    // SAVER never overspends → excluded from the bar
    expect(
      body.overspent_by_category.find((x) => x.category_id === fix.saverId),
    ).toBeUndefined();
    // reserves-by-category mirrors get-reserves-summary rows — SAVER present
    expect(
      body.reserves_by_category.some((x) => x.category_id === fix.saverId),
    ).toBe(true);
  });

  it("rejects an inverted range with 400", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/overspent-reserves?from=2026-03-31&to=2026-01-01`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 cross-tenant", async () => {
    const app = await buildApp({
      userId: other.userId,
      allowedTenantIds: [other.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/overspent-reserves?from=2026-01-01&to=2026-03-31`,
    );
    expect(res.status).toBe(404);
  });
});
