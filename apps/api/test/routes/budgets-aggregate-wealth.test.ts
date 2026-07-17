/**
 * budgets-aggregate-wealth.test.ts — Integration test for
 * GET /budgets/aggregate/wealth (Task 9).
 *
 * Real Postgres. Mounts budgetsAggregateRoutesFactory wired against the REAL
 * getAggregateWealthTrend, composed the same way boot.ts composes it: real
 * getOverviewWealth (3h snapshot series + live point, no snapshots seeded here
 * so the series is the zero/live-point grid — this test only asserts shape),
 * real workspaceRepo.listForUser / getAggPrefsForUser, real displayCurrencyReader,
 * and an in-memory FX provider (both budgets USD, same-currency rate=1).
 *
 * A fresh user with TWO budgets → GET .../aggregate/wealth?range=6M&include=A,B
 * asserts {display_currency, series, grow}; series values are string cents.
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

const SYSTEM_USER_UUID = "00000000-0000-0000-0000-000000000001";

async function createUser(): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Aggregate Wealth Test', true, now(), now())`,
      [userId, `agg-wealth-${userId.slice(0, 8)}@example.com`],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return userId;
}

async function createBudget(userId: string, name: string): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, $3, 'PRIVATE', 'USD', $4, 1, now())`,
      [budgetId, `ws-aggw-${budgetId.slice(0, 8)}`, name, userId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members
         (id, budget_id, user_id, role, ownership_share_pct, include_in_aggregation, created_at)
       VALUES ($1, $2, $3, 'owner', 100, true, now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return budgetId;
}

async function seedWallet(
  budgetId: string,
  userId: string,
  balance: string,
): Promise<void> {
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
    await client.query(
      `INSERT INTO budgeting.wallets
         (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Spendings', 'SPENDINGS', 'USD', $3::numeric, now(), $4)`,
      [crypto.randomUUID(), budgetId, balance, userId],
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

async function buildApp(opts: { userId: string }) {
  const { budgetsAggregateRoutesFactory } =
    await import("../../src/routes/budgets-aggregate");
  const { getAggregateWealthTrend, rangeToFromTo } =
    await import("@budget/budgeting/src/application/get-aggregate-wealth-trend");
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
  const { listHoldings } =
    await import("@budget/investments/src/application/list-holdings");
  const { DrizzleHoldingRepo } =
    await import("@budget/investments/src/adapters/persistence/holding-repo");
  const { DrizzleBudgetRepo } =
    await import("@budget/tenancy/src/adapters/persistence/workspace-repo");
  const { DrizzleUserRepo } =
    await import("@budget/identity/src/adapters/persistence/user-repo");
  const { UserId, InMemoryFxProvider } = await import("@budget/shared-kernel");

  const fxProvider = new InMemoryFxProvider();
  const listHoldingsUC = listHoldings({
    holdingRepo: new DrizzleHoldingRepo(),
    fxProvider,
  });
  const holdingsValuation = {
    investmentValueCents: async (input: {
      tenantId: string;
      budgetId: string;
      defaultCurrency: string;
    }): Promise<bigint> => {
      const r = await listHoldingsUC({
        tenantId: input.tenantId,
        budgetId: input.budgetId,
        actorUserId: SYSTEM_USER_UUID,
        budgetCurrency: input.defaultCurrency,
      });
      if (r.isErr()) throw r.error;
      return r.value.holdings.reduce(
        (s, h) => s + BigInt(h.valueInBudgetCents),
        0n,
      );
    },
    investmentCostBasisCents: async (input: {
      tenantId: string;
      budgetId: string;
      defaultCurrency: string;
    }): Promise<bigint> => {
      const r = await listHoldingsUC({
        tenantId: input.tenantId,
        budgetId: input.budgetId,
        actorUserId: SYSTEM_USER_UUID,
        budgetCurrency: input.defaultCurrency,
      });
      if (r.isErr()) throw r.error;
      return r.value.holdings.reduce(
        (s, h) => s + BigInt(h.costInBudgetCents),
        0n,
      );
    },
  };

  const summaryRepo = createBudgetHomeSummaryRepo();
  const overviewCardsRepo = createOverviewCardsRepo();

  const getOverviewWealthUC = getOverviewWealth({
    snapshotRepo: createWealthSnapshotRepo(),
    computeWealthNow: computeBudgetWealthNow({
      walletRepo: overviewCardsRepo,
      holdingsValuation,
      fxProvider,
    }),
    holdingsByType: {
      valueByType: async () => [],
    },
    metaReader: summaryRepo,
  });

  const workspaceRepo = new DrizzleBudgetRepo();
  const userRepo = new DrizzleUserRepo();
  const displayCurrencyReader = {
    getDisplayCurrency: async (userId: string) => {
      const u = await userRepo.findById(UserId(userId));
      return u?.display_currency ?? null;
    },
  };

  const getAggregateWealthTrendService = getAggregateWealthTrend({
    listForUser: async (userId: string) => {
      const rows = await workspaceRepo.listForUser(userId);
      return rows.map((b) => ({
        id: b.id,
        default_currency: b.default_currency,
      }));
    },
    getAggPrefsForUser: (userId) => workspaceRepo.getAggPrefsForUser(userId),
    getWealthForBudget: async ({ tenantId, budgetId, range }) => {
      const { from, to } = rangeToFromTo(range, new Date());
      const result = await getOverviewWealthUC({
        tenantId,
        budgetId,
        from,
        to,
        view: "capitalization",
      });
      if (result.isErr()) {
        const meta = await summaryRepo.getBudgetMeta(budgetId);
        return { currency: meta?.default_currency ?? "USD", series: [] };
      }
      return {
        currency: result.value.currency,
        series: result.value.series.map((p) => ({
          label: p.label,
          value_cents: BigInt(p.value_cents),
        })),
      };
    },
    displayCurrencyReader,
    fxProvider,
  });

  const deps = {
    budgeting: { getAggregateWealthTrend: getAggregateWealthTrendService },
  } as never;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: opts.userId } });
    await next();
  });
  app.route("/budgets", budgetsAggregateRoutesFactory(deps));
  return app;
}

describe("GET /budgets/aggregate/wealth", () => {
  let userId: string;
  let budgetA: string;
  let budgetB: string;

  beforeAll(async () => {
    userId = await createUser();
    budgetA = await createBudget(userId, "Budget A");
    budgetB = await createBudget(userId, "Budget B");
    await seedWallet(budgetA, userId, "100.00");
    await seedWallet(budgetB, userId, "50.00");
  });

  it("returns the combined net-worth trend for the included budgets", async () => {
    const app = await buildApp({ userId });
    const res = await app.request(
      `/budgets/aggregate/wealth?range=6M&include=${budgetA},${budgetB}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      display_currency: string;
      series: Array<{ label: string; value_cents: string }>;
      grow: { delta_cents: string; delta_pct: number };
    };
    expect(typeof body.display_currency).toBe("string");
    expect(Array.isArray(body.series)).toBe(true);
    for (const point of body.series) {
      expect(typeof point.label).toBe("string");
      expect(typeof point.value_cents).toBe("string");
    }
    expect(typeof body.grow.delta_cents).toBe("string");
    expect(typeof body.grow.delta_pct).toBe("number");
  });

  it("returns 401 without a session", async () => {
    const { budgetsAggregateRoutesFactory } =
      await import("../../src/routes/budgets-aggregate");
    const noAuth = new Hono();
    const deps = {
      budgeting: {
        getAggregateWealthTrend: async () => {
          throw new Error("should not be called");
        },
      },
    } as never;
    noAuth.route("/budgets", budgetsAggregateRoutesFactory(deps));
    const res = await noAuth.request(
      `/budgets/aggregate/wealth?range=6M&include=${budgetA}`,
    );
    expect(res.status).toBe(401);
  });
});
