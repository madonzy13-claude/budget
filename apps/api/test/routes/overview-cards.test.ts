/**
 * overview-cards.test.ts — Integration test for GET /budgets/:id/overview/cards
 * (Phase 11 Plan 11-03, D-07/08/09/11, T-11-05).
 *
 * Real Postgres. Wires the REAL Overview cards service against the new
 * overview-cards-repo (listWalletsWithType), the real holdings valuation (over
 * investments.listHoldings), and the real getCushionSummary. The heavy spendings
 * grid (reserve replay engine) is faked here with an empty category set — the
 * after-reserves overspent math is exhaustively covered by the unit tests
 * (packages/budgeting/test/overview/get-overview-cards.test.ts); this test
 * targets the new route, wallet partition, capitalization, and tenant guard.
 *
 * Mirrors cushion-summary.test.ts bootstrapping (real DB, set_config GUCs to
 * bypass RLS during seed).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";
import { ok, err, type Result } from "@budget/shared-kernel";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

const SYSTEM_USER_UUID = "00000000-0000-0000-0000-000000000001";

interface Fixture {
  userId: string;
  budgetId: string;
}

async function createFixture(): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Overview Test', true, now(), now())`,
      [userId, `overview-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count,
          cushion_enabled, cushion_target_months, created_at)
       VALUES ($1, $2, 'Overview Budget', 'PRIVATE', 'USD', $3, 1, true, 6, now())`,
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
  return { userId, budgetId };
}

async function seedWallet(
  budgetId: string,
  userId: string,
  walletType: "SPENDINGS" | "RESERVE" | "CUSHION",
  balance: string,
  currency = "USD",
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
       VALUES ($1, $2, $3, $4, $5, $6::numeric, now(), $7)`,
      [
        crypto.randomUUID(),
        budgetId,
        `${walletType} wallet`,
        walletType,
        currency,
        balance,
        userId,
      ],
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

/** Seed an active category_limits row with a cushion_amount (real_months source). */
async function seedCushionLimit(
  budgetId: string,
  userId: string,
  cushionAmountCents: bigint,
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
    const categoryId = crypto.randomUUID();
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Cat', now(), $3)`,
      [categoryId, budgetId, userId],
    );
    await client.query(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency, effective_from, actor_user_id, created_at)
       VALUES ($1, $2, $3, 0, 'USD', $4::bigint, 'USD', '2026-01-01'::date, $5, now())`,
      [
        crypto.randomUUID(),
        budgetId,
        categoryId,
        cushionAmountCents.toString(),
        userId,
      ],
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

async function buildApp(opts: { userId: string; allowedTenantIds: string[] }) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
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
  const { FrankfurterFxProvider } =
    await import("@budget/budgeting/src/adapters/fx/frankfurter");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
  const { workerPool } = await import("@budget/platform");

  const fxProvider = new FrankfurterFxProvider(
    new DrizzleFxRateCacheRepo(workerPool()),
  );
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
  };

  const getOverviewCardsUC = getOverviewCards({
    metaReader: createBudgetHomeSummaryRepo(),
    walletRepo: createOverviewCardsRepo(),
    holdingsValuation,
    fxProvider,
    cushionSummary: getCushionSummary({ fxProvider }),
    // Fake: empty category set (overspent math is unit-tested; the replay engine
    // is out of scope for this route test).
    spendingsSummary: async () =>
      ok({ budgetCurrency: "USD", categories: [] }) as Result<
        { budgetCurrency: string; categories: never[] },
        Error
      >,
  });

  const deps = {
    budgeting: { getOverviewCards: getOverviewCardsUC },
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

describe("GET /budgets/:id/overview/cards", () => {
  let fix: Fixture;
  let other: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
    other = await createFixture();
    await seedWallet(fix.budgetId, fix.userId, "SPENDINGS", "100.00");
    await seedWallet(fix.budgetId, fix.userId, "RESERVE", "50.00");
    await seedWallet(fix.budgetId, fix.userId, "CUSHION", "30.00");
    // required = 100.00 × 6 = 600.00 = 60_000; actual (CUSHION wallet) = 30.00 = 3_000
    // → real_months = 3000 / (60000/6) = 0.3
    await seedCushionLimit(fix.budgetId, fix.userId, 10000n);
  });

  it("returns the 5-card DTO in default_currency with string cents", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(`/budgets/${fix.budgetId}/overview/cards`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      default_currency: string;
      available_to_spend_cents: string;
      capitalization_cents: string;
      investment_value_cents: string;
      available_reserves_cents: string;
      cushion: { enabled: boolean; real_months: number; total_cents: string };
      overspent: { count: number; currency: string; top: unknown[] };
    };
    expect(body.default_currency).toBe("USD");
    expect(body.available_to_spend_cents).toBe("10000"); // SPENDINGS only
    expect(body.available_reserves_cents).toBe("5000"); // RESERVE only
    expect(body.capitalization_cents).toBe("18000"); // all wallets (100+50+30), no holdings
    expect(body.investment_value_cents).toBe("0");
    expect(body.cushion.enabled).toBe(true);
    expect(body.cushion.real_months).toBeCloseTo(0.3, 5);
    expect(body.cushion.total_cents).toBe("3000");
    expect(body.overspent.count).toBe(0);
    expect(body.overspent.currency).toBe("USD");
    expect(body.overspent.top).toEqual([]);
  });

  it("returns 401 without a session", async () => {
    const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
    const noAuth = new Hono();
    const deps = {
      budgeting: {
        getOverviewCards: async () => err(new Error("should not be called")),
      },
      tenancy: {
        workspaceRepo: { listForUser: async () => [] },
        memberShareRepo: { update: async () => {} },
      },
      identity: {
        auth: { api: {} },
        userRepo: { setActiveWorkspaceIds: async () => {} },
      },
    } as never;
    noAuth.route("/budgets", budgetsRoutesFactory(deps));
    const res = await noAuth.request(`/budgets/${fix.budgetId}/overview/cards`);
    expect(res.status).toBe(401);
  });

  it("returns 404 when budgetId is not in caller's tenantIds (cross-tenant, T-11-05)", async () => {
    const app = await buildApp({
      userId: other.userId,
      allowedTenantIds: [other.budgetId], // does NOT include fix.budgetId
    });
    const res = await app.request(`/budgets/${fix.budgetId}/overview/cards`);
    expect(res.status).toBe(404);
  });
});
