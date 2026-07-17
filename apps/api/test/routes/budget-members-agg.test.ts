/**
 * budget-members-agg.test.ts — Integration tests for Task 8's two member-write
 * routes, added to the existing budgetMembersRoutesFactory in budget-members.ts:
 *
 *   PUT /budgets/:id/aggregation        — self-service include-in-aggregation flag
 *   PUT /budgets/:id/members/shares     — owner-gated ownership-share rewrite
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

async function addMember(
  budgetId: string,
  userId: string,
  role: "owner" | "member",
  pct: number,
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO tenancy.budget_members
         (id, budget_id, user_id, role, ownership_share_pct, include_in_aggregation, created_at)
       VALUES ($1, $2, $3, $4, $5, true, now())`,
      [crypto.randomUUID(), budgetId, userId, role, pct],
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

async function buildMembersApp(userId: string, tenantIds: string[]) {
  const { budgetMembersRoutesFactory } =
    await import("../../src/routes/budget-members");
  const { DrizzleBudgetRepo } =
    await import("@budget/tenancy/src/adapters/persistence/workspace-repo");
  const workspaceRepo = new DrizzleBudgetRepo();
  const deps = { tenancy: { workspaceRepo }, identity: {} } as never;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", tenantIds);
    await next();
  });
  app.route("/budgets", budgetMembersRoutesFactory(deps));
  return app;
}

describe("PUT /budgets/:id/aggregation (Task 8, self-service)", () => {
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
});

describe("PUT /budgets/:id/members/shares (Task 8, owner-gated)", () => {
  it("rejects a non-owner (403), rejects a bad total (422), accepts Σ=100 (200)", async () => {
    const ownerUserId = await createUser();
    const memberUserId = await createUser();
    const budgetId = await createBudget(ownerUserId, "Shares Write Budget");
    await addMember(budgetId, memberUserId, "member", 0);

    // non-owner blocked
    const memberApp = await buildMembersApp(memberUserId, [budgetId]);
    const forbidden = await memberApp.request(
      `/budgets/${budgetId}/members/shares`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shares: [
            { userId: ownerUserId, pct: 50 },
            { userId: memberUserId, pct: 50 },
          ],
        }),
      },
    );
    expect(forbidden.status).toBe(403);

    // owner, bad total
    const ownerApp = await buildMembersApp(ownerUserId, [budgetId]);
    const bad = await ownerApp.request(`/budgets/${budgetId}/members/shares`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shares: [
          { userId: ownerUserId, pct: 50 },
          { userId: memberUserId, pct: 60 },
        ],
      }),
    });
    expect(bad.status).toBe(422);

    // owner, good total
    const ok = await ownerApp.request(`/budgets/${budgetId}/members/shares`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shares: [
          { userId: ownerUserId, pct: 40 },
          { userId: memberUserId, pct: 60 },
        ],
      }),
    });
    expect(ok.status).toBe(200);
  });

  it("rejects a payload missing a current member (422)", async () => {
    const ownerUserId = await createUser();
    const memberUserId = await createUser();
    const budgetId = await createBudget(ownerUserId, "Shares Missing Budget");
    await addMember(budgetId, memberUserId, "member", 0);

    const ownerApp = await buildMembersApp(ownerUserId, [budgetId]);
    const res = await ownerApp.request(`/budgets/${budgetId}/members/shares`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shares: [{ userId: ownerUserId, pct: 100 }] }),
    });
    expect(res.status).toBe(422);
  });
});
