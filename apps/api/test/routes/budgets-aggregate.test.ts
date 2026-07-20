/**
 * budgets-aggregate.test.ts — Integration test for GET /budgets/aggregate (Task 7).
 *
 * Real Postgres. Mounts budgetsAggregateRoutesFactory wired against the REAL
 * getAllBudgetsAggregate (Task 6), composed the same way boot.ts composes it:
 * real workspaceRepo.listForUser / getAggPrefsForUser (DrizzleBudgetRepo), real
 * displayCurrencyReader (DrizzleUserRepo), real getOverviewCards (mirrors the
 * composition in overview-cards.test.ts — spendings/reserves summaries faked
 * since the replay engine is unit-tested elsewhere), and an in-memory FX
 * provider (both budgets are USD, so same-currency rate=1, no seeding needed).
 *
 * A fresh user with TWO budgets → asserts the aggregate shape: display_currency
 * string, budgets array of length 2, string cents on the wire, my_share_pct +
 * included present per row.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";
import { ok, type Result } from "@budget/shared-kernel";

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
       VALUES ($1, $2, 'Aggregate Test', true, now(), now())`,
      [userId, `agg-${userId.slice(0, 8)}@example.com`],
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
      [budgetId, `ws-agg-${budgetId.slice(0, 8)}`, name, userId],
    );
    // Owner membership row with a real ownership share (mirrors the app-level
    // 100-on-create behaviour in better-auth-org.ts — this fixture inserts
    // directly, so it must set the share explicitly rather than rely on the
    // column DEFAULT 0).
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
  const { getAllBudgetsAggregate } =
    await import("@budget/budgeting/src/application/get-all-budgets-aggregate");
  const { getOverviewCards } =
    await import("@budget/budgeting/src/application/get-overview-cards");
  const { createOverviewCardsRepo } =
    await import("@budget/budgeting/src/adapters/persistence/overview-cards-repo");
  const { createBudgetHomeSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/budget-home-summary-repo");
  const { getCushionSummary } =
    await import("@budget/budgeting/src/application/get-cushion-summary");
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

  const getOverviewCardsUC = getOverviewCards({
    metaReader: createBudgetHomeSummaryRepo(),
    walletRepo: createOverviewCardsRepo(),
    holdingsValuation,
    fxProvider,
    cushionSummary: getCushionSummary({ fxProvider }),
    // Fake: empty category set (overspent math is unit-tested elsewhere).
    spendingsSummary: async () =>
      ok({ budgetCurrency: "USD", categories: [] }) as Result<
        { budgetCurrency: string; categories: never[] },
        Error
      >,
    // Fake: no reserve requirement (reserve engine is unit-tested elsewhere).
    reservesSummary: async () =>
      ok({
        totals: {
          internalCents: "0",
          userDefinedCents: "0",
          direction: "NONE" as const,
          disabled: false,
        },
      }) as Result<
        {
          totals: {
            internalCents: string;
            userDefinedCents: string;
            direction: "NONE";
            disabled: boolean;
          };
        },
        Error
      >,
  });

  const workspaceRepo = new DrizzleBudgetRepo();
  const userRepo = new DrizzleUserRepo();
  const displayCurrencyReader = {
    getDisplayCurrency: async (userId: string) => {
      const u = await userRepo.findById(UserId(userId));
      return u?.display_currency ?? null;
    },
  };

  const getAllBudgetsAggregateService = getAllBudgetsAggregate({
    // BudgetDTO uses camelCase (memberCount); the aggregate deps port wants
    // snake_case (member_count) — mirrors the adapter boundary in boot.ts.
    listForUser: async (userId: string) => {
      const rows = await workspaceRepo.listForUser(userId);
      return rows.map((b) => ({
        id: b.id,
        name: b.name,
        default_currency: b.default_currency,
        member_count: b.memberCount,
        pendingTasksCount: b.pendingTasksCount,
      }));
    },
    getOverviewCardsForTenant: getOverviewCardsUC,
    getAggPrefsForUser: (userId) => workspaceRepo.getAggPrefsForUser(userId),
    displayCurrencyReader,
    fxProvider,
  });

  const deps = {
    budgeting: { getAllBudgetsAggregate: getAllBudgetsAggregateService },
  } as never;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: opts.userId } });
    await next();
  });
  app.route("/budgets", budgetsAggregateRoutesFactory(deps));
  return app;
}

describe("GET /budgets/aggregate", () => {
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

  it("returns per-budget rows in the user's display currency", async () => {
    const app = await buildApp({ userId });
    const res = await app.request("/budgets/aggregate");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      display_currency: string;
      budgets: Array<{
        id: string;
        net_worth_cents: string;
        my_share_pct: number;
        included: boolean;
      }>;
    };
    expect(typeof body.display_currency).toBe("string");
    expect(Array.isArray(body.budgets)).toBe(true);
    expect(body.budgets.length).toBe(2);
    const ids = body.budgets.map((b) => b.id).sort();
    expect(ids).toEqual([budgetA, budgetB].sort());
    expect(typeof body.budgets[0]!.net_worth_cents).toBe("string");
    expect(body.budgets[0]).toHaveProperty("my_share_pct");
    expect(body.budgets[0]).toHaveProperty("included");
    // Single owner on both budgets → full share, included by default.
    for (const row of body.budgets) {
      expect(row.my_share_pct).toBe(100);
      expect(row.included).toBe(true);
    }
  });

  it("returns 401 without a session", async () => {
    const { budgetsAggregateRoutesFactory } =
      await import("../../src/routes/budgets-aggregate");
    const noAuth = new Hono();
    const deps = {
      budgeting: {
        getAllBudgetsAggregate: async () => {
          throw new Error("should not be called");
        },
      },
    } as never;
    noAuth.route("/budgets", budgetsAggregateRoutesFactory(deps));
    const res = await noAuth.request("/budgets/aggregate");
    expect(res.status).toBe(401);
  });
});
