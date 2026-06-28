/**
 * overview-wealth.test.ts — Integration test for GET /budgets/:id/overview/wealth
 * (Phase 11 Plan 11-06, D-04/15/16/18/20). Real Postgres: real wealth-snapshot-repo
 * (snapshot series) + real wallet read for the live current point.
 *
 * Snapshots are seeded relative to the current month (prev2, prev1, current) so the
 * live point (computed at server now()) always overrides the current bucket — D-04.
 * A wallet of 2000.00 makes the live capitalization deterministic (= 200000, no
 * holdings). holdingsValuation/holdingsByType are stubbed so the pie is
 * deterministic without dragging in the Phase-9 pricing pipeline (pie CONTENT is
 * covered by the unit test). NO DB mocking of the snapshot/wallet reads.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

// Snapshots are written by the worker cron (11-07), so app_role has no INSERT on
// budget_wealth_snapshots — seed them with the worker role.
const WORKER_URL = (process.env.DATABASE_URL_WORKER ?? "").replace(
  "@db:",
  "@localhost:",
);
if (!WORKER_URL)
  throw new Error("DATABASE_URL_WORKER required for integration tests");

const { resetPools } = await import("@budget/platform");
resetPools();

// Dates relative to the current month so the live point always lands in-range.
const NOW = new Date();
const Y = NOW.getUTCFullYear();
const MO = NOW.getUTCMonth();
const d0 = new Date(Date.UTC(Y, MO, 1)); // current month, day 1
const d1 = new Date(Date.UTC(Y, MO - 1, 15)); // prev1
const d2 = new Date(Date.UTC(Y, MO - 2, 15)); // prev2
const ym = (d: Date) => d.toISOString().slice(0, 7);
const FROM = `${ym(d2)}-01`;
const TO = `${ym(d0)}-28`;

interface Fixture {
  userId: string;
  budgetId: string;
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

async function createFixture(): Promise<Fixture> {
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Wealth Test', true, now(), now())`,
      [userId, `wealth-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Wealth Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ws-we-${budgetId.slice(0, 8)}`, userId],
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
    // 2000.00 USD wallet → live capitalization = 200000 (no holdings).
    await c.query(
      `INSERT INTO budgeting.wallets
         (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Main', 'SPENDINGS', 'USD', 2000::numeric, now(), $3)`,
      [crypto.randomUUID(), budgetId, userId],
    );
  });

  // 3h-snapshot rows: prev2, prev1, current (overridden by the live point).
  // worker_role owns INSERT on budget_wealth_snapshots (the cron writes them).
  const wpool = new Pool({ connectionString: WORKER_URL });
  const wc = await wpool.connect();
  try {
    await wc.query("BEGIN");
    await wc.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    for (const [capturedAt, cap, inv] of [
      [d2.toISOString(), 100000, 40000],
      [d1.toISOString(), 110000, 44000],
      [d0.toISOString(), 150000, 60000],
    ] as const) {
      await wc.query(
        `INSERT INTO budgeting.budget_wealth_snapshots
           (id, tenant_id, budget_id, captured_at, capitalization_cents, investment_value_cents, currency)
         VALUES ($1, $2, $2, $3::timestamptz, $4, $5, 'USD')`,
        [crypto.randomUUID(), budgetId, capturedAt, cap, inv],
      );
    }
    await wc.query("COMMIT");
  } catch (e) {
    await wc.query("ROLLBACK");
    throw e;
  } finally {
    wc.release();
    await wpool.end();
  }

  return { userId, budgetId };
}

async function buildApp(opts: { userId: string; allowedTenantIds: string[] }) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
  const { getOverviewWealth } =
    await import("@budget/budgeting/src/application/get-overview-wealth");
  const { computeBudgetWealthNow } =
    await import("@budget/budgeting/src/application/compute-budget-wealth-now");
  const { createWealthSnapshotRepo } =
    await import("@budget/budgeting/src/adapters/persistence/wealth-snapshot-repo");
  const { createOverviewCardsRepo } =
    await import("@budget/budgeting/src/adapters/persistence/overview-cards-repo");
  const { createBudgetHomeSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/budget-home-summary-repo");
  const { FrankfurterFxProvider } =
    await import("@budget/budgeting/src/adapters/fx/frankfurter");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
  const { workerPool } = await import("@budget/platform");

  const fxProvider = new FrankfurterFxProvider(
    new DrizzleFxRateCacheRepo(workerPool()),
  );
  const getOverviewWealthUC = getOverviewWealth({
    snapshotRepo: createWealthSnapshotRepo(),
    computeWealthNow: computeBudgetWealthNow({
      walletRepo: createOverviewCardsRepo(),
      // Stubbed: live investment value = 0 (no holdings); pie below is the stub.
      holdingsValuation: { investmentValueCents: async () => 0n },
      fxProvider,
    }),
    holdingsByType: {
      valueByType: async () => [{ holding_type: "STOCK", value_cents: 12345n }],
    },
    metaReader: createBudgetHomeSummaryRepo(),
  });

  const deps = {
    budgeting: { getOverviewWealth: getOverviewWealthUC },
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

describe("GET /budgets/:id/overview/wealth", () => {
  let fix: Fixture;
  let other: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
    other = await createFixture();
  });

  it("capitalization: snapshot series + live point overrides current bucket; grow + dynamics (D-04/15/16)", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/wealth?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      currency: string;
      view: string;
      bucket: string;
      series: { label: string; value_cents: string }[];
      grow: { delta_cents: string; delta_pct: number | null };
      monthly_avg_grow_pct: number | null;
      dynamics: { label: string; pct: number | null }[];
      pie: unknown;
    };
    expect(body.currency).toBe("USD");
    expect(body.view).toBe("capitalization");
    expect(body.bucket).toBe("monthly");
    expect(body.series.map((p) => p.label)).toEqual([ym(d2), ym(d1), ym(d0)]);
    // prev2 100000, prev1 110000, current = live 200000 (wallet) overrides 150000
    expect(body.series.map((p) => p.value_cents)).toEqual([
      "100000",
      "110000",
      "200000",
    ]);
    expect(body.grow.delta_cents).toBe("100000");
    expect(body.grow.delta_pct).toBeCloseTo(100.0, 4);
    expect(body.dynamics[0]!.pct).toBeCloseTo(10.0, 4);
    expect(body.dynamics[1]!.pct).toBeCloseTo((90 / 110) * 100, 3);
    expect(body.monthly_avg_grow_pct).toBeCloseTo(
      (10 + (90 / 110) * 100) / 2,
      3,
    );
    expect(body.pie).toBeNull();
  });

  it("investments: series uses investment_value_cents + per-type pie present (D-18)", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/wealth?from=${FROM}&to=${TO}&view=investments`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      view: string;
      series: { value_cents: string }[];
      pie: { holding_type: string; value_cents: string }[] | null;
    };
    expect(body.view).toBe("investments");
    // prev2 40000, prev1 44000 (current = live inv 0 with no holdings)
    expect(body.series[0]!.value_cents).toBe("40000");
    expect(body.series[1]!.value_cents).toBe("44000");
    expect(body.pie).toEqual([{ holding_type: "STOCK", value_cents: "12345" }]);
  });

  it("rejects an invalid view with 400", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/wealth?from=${FROM}&to=${TO}&view=bogus`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 cross-tenant", async () => {
    const app = await buildApp({
      userId: other.userId,
      allowedTenantIds: [other.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/wealth?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(404);
  });
});
