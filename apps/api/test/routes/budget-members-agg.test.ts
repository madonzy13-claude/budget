/**
 * budget-members-agg.test.ts — Integration tests for the self-service
 * aggregation route on budgetMembersRoutesFactory in budget-members.ts:
 *
 *   PUT /budgets/:id/aggregation  — self-service include-in-aggregation flag
 *                                   + optional self-set ownership_share_pct
 *                                   (no Σ=100 cross-member constraint)
 *
 * Real Postgres, same fixture style as budgets-aggregate.test.ts (raw-SQL user/
 * budget/member inserts + inline session middleware + `as never` deps casting).
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;
// listMembers (workspace-repo.ts) runs via withInfraTx → workerDb(), which reads
// DATABASE_URL_WORKER, not DATABASE_URL_APP — must rewrite both for the test
// to reach Postgres from outside the Docker network (see budget-invitations.test.ts).
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace(
    "@db:",
    "@localhost:",
  );
}

const { resetPools } = await import("@budget/platform");
resetPools();

async function createUser(): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Member Write Test', true, now(), now())`,
      [userId, `mw-${userId.slice(0, 8)}@example.com`],
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

async function createBudget(
  ownerUserId: string,
  name: string,
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, $3, 'PRIVATE', 'USD', $4, 1, now())`,
      [budgetId, `ws-mw-${budgetId.slice(0, 8)}`, name, ownerUserId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members
         (id, budget_id, user_id, role, ownership_share_pct, include_in_aggregation, created_at)
       VALUES ($1, $2, $3, 'owner', 100, true, now())`,
      [crypto.randomUUID(), budgetId, ownerUserId],
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

describe("PUT /budgets/:id/aggregation (self-service)", () => {
  it("flips the caller's include flag (self, no owner gate)", async () => {
    const userId = await createUser();
    const budgetId = await createBudget(userId, "Agg Flip Budget");

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
    const { UserId, InMemoryFxProvider, ok } =
      await import("@budget/shared-kernel");
    const { budgetMembersRoutesFactory } =
      await import("../../src/routes/budget-members");

    const fxProvider = new InMemoryFxProvider();
    const listHoldingsUC = listHoldings({
      holdingRepo: new DrizzleHoldingRepo(),
      fxProvider,
    });
    const SYSTEM_USER_UUID = "00000000-0000-0000-0000-000000000001";
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
      spendingsSummary: async () =>
        ok({ budgetCurrency: "USD", categories: [] }) as never,
      reservesSummary: async () =>
        ok({
          totals: {
            internalCents: "0",
            userDefinedCents: "0",
            direction: "NONE" as const,
            disabled: false,
          },
        }) as never,
    });

    const workspaceRepo = new DrizzleBudgetRepo();
    const userRepo = new DrizzleUserRepo();
    const displayCurrencyReader = {
      getDisplayCurrency: async (uid: string) => {
        const u = await userRepo.findById(UserId(uid));
        return u?.display_currency ?? null;
      },
    };

    const getAllBudgetsAggregateService = getAllBudgetsAggregate({
      listForUser: async (uid: string) => {
        const rows = await workspaceRepo.listForUser(uid);
        return rows.map((b) => ({
          id: b.id,
          name: b.name,
          default_currency: b.default_currency,
          member_count: b.memberCount,
          pendingTasksCount: b.pendingTasksCount,
        }));
      },
      getOverviewCardsForTenant: getOverviewCardsUC,
      getAggPrefsForUser: (uid: string) =>
        workspaceRepo.getAggPrefsForUser(uid),
      displayCurrencyReader,
      fxProvider,
    });

    const deps = {
      tenancy: { workspaceRepo },
      identity: {},
      budgeting: { getAllBudgetsAggregate: getAllBudgetsAggregateService },
    } as never;

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("session", { user: { id: userId } });
      c.set("tenantIds", [budgetId]);
      await next();
    });
    app.route("/budgets", budgetMembersRoutesFactory(deps));
    app.route("/budgets", budgetsAggregateRoutesFactory(deps));

    const res = await app.request(`/budgets/${budgetId}/aggregation`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ included: false }),
    });
    expect(res.status).toBe(200);

    const aggRes = await app.request("/budgets/aggregate");
    expect(aggRes.status).toBe(200);
    const agg = (await aggRes.json()) as {
      budgets: Array<{ id: string; included: boolean }>;
    };
    expect(agg.budgets.find((b) => b.id === budgetId)?.included).toBe(false);
  });

  it("persists an optional share_pct and it's reflected in GET /budgets/aggregate (no Σ=100 check)", async () => {
    const userId = await createUser();
    const budgetId = await createBudget(userId, "Agg Share Budget");

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
    const { UserId, InMemoryFxProvider, ok } =
      await import("@budget/shared-kernel");
    const { budgetMembersRoutesFactory } =
      await import("../../src/routes/budget-members");

    const fxProvider = new InMemoryFxProvider();
    const listHoldingsUC = listHoldings({
      holdingRepo: new DrizzleHoldingRepo(),
      fxProvider,
    });
    const SYSTEM_USER_UUID = "00000000-0000-0000-0000-000000000001";
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
      spendingsSummary: async () =>
        ok({ budgetCurrency: "USD", categories: [] }) as never,
      reservesSummary: async () =>
        ok({
          totals: {
            internalCents: "0",
            userDefinedCents: "0",
            direction: "NONE" as const,
            disabled: false,
          },
        }) as never,
    });

    const workspaceRepo = new DrizzleBudgetRepo();
    const userRepo = new DrizzleUserRepo();
    const displayCurrencyReader = {
      getDisplayCurrency: async (uid: string) => {
        const u = await userRepo.findById(UserId(uid));
        return u?.display_currency ?? null;
      },
    };

    const getAllBudgetsAggregateService = getAllBudgetsAggregate({
      listForUser: async (uid: string) => {
        const rows = await workspaceRepo.listForUser(uid);
        return rows.map((b) => ({
          id: b.id,
          name: b.name,
          default_currency: b.default_currency,
          member_count: b.memberCount,
          pendingTasksCount: b.pendingTasksCount,
        }));
      },
      getOverviewCardsForTenant: getOverviewCardsUC,
      getAggPrefsForUser: (uid: string) =>
        workspaceRepo.getAggPrefsForUser(uid),
      displayCurrencyReader,
      fxProvider,
    });

    const deps = {
      tenancy: { workspaceRepo },
      identity: {},
      budgeting: { getAllBudgetsAggregate: getAllBudgetsAggregateService },
    } as never;

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("session", { user: { id: userId } });
      c.set("tenantIds", [budgetId]);
      await next();
    });
    app.route("/budgets", budgetMembersRoutesFactory(deps));
    app.route("/budgets", budgetsAggregateRoutesFactory(deps));

    // baseline at the default share (100%)
    const before = await app.request("/budgets/aggregate");
    const beforeBody = (await before.json()) as {
      budgets: Array<{
        id: string;
        my_share_pct: number;
        net_worth_cents: string;
      }>;
    };
    const beforeRow = beforeBody.budgets.find((b) => b.id === budgetId)!;
    expect(beforeRow.my_share_pct).toBe(100); // column DEFAULT

    const res = await app.request(`/budgets/${budgetId}/aggregation`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ included: true, share_pct: 50 }),
    });
    expect(res.status).toBe(200);

    const after = await app.request("/budgets/aggregate");
    const afterBody = (await after.json()) as {
      budgets: Array<{
        id: string;
        my_share_pct: number;
        net_worth_cents: string;
      }>;
    };
    const afterRow = afterBody.budgets.find((b) => b.id === budgetId)!;
    // Persisted end-to-end: PUT .../aggregation → getAggPrefsForUser →
    // getAllBudgetsAggregate's my_share_pct. The $-scaling itself (share/100
    // × capitalization_cents) is unit-tested in
    // packages/budgeting/test/get-all-budgets-aggregate.test.ts — no Σ=100
    // check anywhere in this path.
    expect(afterRow.my_share_pct).toBe(50);
  });
});
