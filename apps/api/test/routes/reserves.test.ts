/**
 * reserves.test.ts — Integration test for GET /budgets/:id/reserves.
 * Real Postgres, no DB mocks (CLAUDE.md). Requires DATABASE_URL_APP.
 *
 * Phase 05 reserve rewrite (05-14 / RSRV-REWRITE-API). The route now returns the
 * ENGINE-derived shape via deps.budgeting.getReservesSummary:
 *
 *   rows[]        : { categoryId, name, reserveCents, usedCents, overspentCents }
 *   excludedRows[]: same shape (reserve hidden for excluded categories)
 *   totals        : { internalCents, userDefinedCents, surplusCents,
 *                     direction: TOPUP|WITHDRAW|NONE, disabled, budgetCurrency }
 *
 * The OLD model is GONE — these tests assert the new keys are PRESENT and the
 * dead keys (walletSharePercent / walletShareAmountCents / reserveBalanceCents /
 * mismatchCents / totalCategoryReservesCents) are ABSENT from the wire body.
 *
 * Wires the REAL replay orchestrator (event-loader → reserve-engine) so the
 * route exercises the production read path end-to-end (mirrors
 * reserves-adjust.test.ts).
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
  groceryId: string;
  housingId: string;
  currency: string;
}

/**
 * Seed a budget with two categories + limits + a RESERVE wallet (balance
 * 3000.00 → userDefinedCents "300000"). No transactions → clean reserve state
 * (R=0, U=0, overspent=0 per category; internal=0; surplus = userDefined).
 */
async function createFixture(currency = "EUR"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const groceryId = crypto.randomUUID();
  const housingId = crypto.randomUUID();

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
    // Two categories. Grocery carries a color (260613-v1p) so the reserves DTO
    // must thread colorKey through; Housing stays colorless (null → no bar).
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, color_key, created_at, actor_user_id)
       VALUES ($1, $2, 'Grocery', 'blue', now(), $3), ($4, $2, 'Housing', NULL, now(), $3)`,
      [groceryId, budgetId, userId, housingId],
    );
    // Limits (normal 300 / 500; cushion 300 / 250) so the engine has an
    // effective limit per category. effective_from in the past.
    await client.query(
      `INSERT INTO budgeting.category_limits
         (tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency, effective_from, actor_user_id)
       VALUES
         ($1, $2, 300, '${currency}', 300, '${currency}', '2024-01-01'::date, $4),
         ($1, $3, 500, '${currency}', 250, '${currency}', '2024-01-01'::date, $4)`,
      [budgetId, groceryId, housingId, userId],
    );
    // RESERVE wallet → userDefined = 3000.00 → "300000" cents.
    await client.query(
      `INSERT INTO budgeting.wallets
         (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Reserve Wallet', 'RESERVE', $3, 3000.00::numeric, now(), $4)`,
      [crypto.randomUUID(), budgetId, currency, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId, groceryId, housingId, currency };
}

/**
 * Build the budgets router with the REAL reserves stack wired to Postgres.
 * isReservesEnabled is overridable so the disabled path can be exercised
 * without an RLS-blocked UPDATE on tenancy.budgets.
 */
async function buildApp(
  userId: string,
  budgetId: string,
  overrides?: { isReservesEnabled?: (tenantId: string) => Promise<boolean> },
) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
  const { getReservesSummary } =
    await import("@budget/budgeting/src/application/get-reserves-summary");
  const { adjustCategoryReserve } =
    await import("@budget/budgeting/src/application/adjust-category-reserve");
  const { getReservePositions } =
    await import("@budget/budgeting/src/application/get-reserve-positions");
  const { createReserveEventLoaderRepo } =
    await import("@budget/budgeting/src/adapters/persistence/reserve-event-loader-repo");
  const { DrizzleCategoryReserveAdjustmentsRepo } =
    await import("@budget/budgeting/src/adapters/persistence/category-reserve-adjustments-repo");
  const { DrizzleCategoriesRepo } =
    await import("@budget/budgeting/src/adapters/persistence/categories-repo");
  const { DrizzleReservesSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/reserves-summary-repo");
  const { DrizzleTransactionRepo } =
    await import("@budget/budgeting/src/adapters/persistence/transaction-repo");
  const { DrizzleSpendingProjectionRepo } =
    await import("@budget/budgeting/src/adapters/persistence/spending-projection-repo");
  const { DrizzleCategoryLimitRepo } =
    await import("@budget/budgeting/src/adapters/persistence/category-limit-repo");

  const categoriesRepo = new DrizzleCategoriesRepo();
  const adjustmentsRepo = new DrizzleCategoryReserveAdjustmentsRepo();
  const reservesSummaryRepo = new DrizzleReservesSummaryRepo();
  const reservePositions = getReservePositions({
    eventLoader: createReserveEventLoaderRepo({
      transactionRepo: new DrizzleTransactionRepo(
        undefined,
        new DrizzleSpendingProjectionRepo(),
      ),
      categoryLimitRepo: new DrizzleCategoryLimitRepo(),
      reservesSummaryRepo,
    }),
  });

  const isReservesEnabled =
    overrides?.isReservesEnabled ?? (async (_tenantId: string) => true);
  const budgetCurrencyOf = async (_tenantId: string): Promise<string> => "EUR";

  const deps = {
    budgeting: {
      getReservesSummary: getReservesSummary({
        reservePositions,
        categoriesRepo,
        budgetCurrencyOf,
        isReservesEnabled,
      }),
      adjustCategoryReserve: adjustCategoryReserve({
        adjustmentsRepo,
        categoriesRepo,
        reservePositions,
        isReservesEnabled,
        budgetCurrencyOf,
      }),
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

describe("GET /budgets/:id/reserves", () => {
  let fix: Fixture;
  let app: Hono;

  beforeAll(async () => {
    fix = await createFixture("EUR");
    app = await buildApp(fix.userId, fix.budgetId);
  });

  it("returns 200 with the engine-derived {rows, excludedRows, totals} shape", async () => {
    const res = await app.request(`/budgets/${fix.budgetId}/reserves`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.rows)).toBe(true);
    expect(Array.isArray(body.excludedRows)).toBe(true);
    expect(body.totals).toBeDefined();
  });

  it("rows carry reserve/used/overspent and NOT the dead share/mismatch keys", async () => {
    const res = await app.request(`/budgets/${fix.budgetId}/reserves`);
    const body = (await res.json()) as any;
    // Two categories with limits → two rows.
    expect(body.rows.length).toBe(2);
    const row = body.rows[0];
    // New keys present.
    expect(row).toHaveProperty("categoryId");
    expect(row).toHaveProperty("name");
    expect(row).toHaveProperty("reserveCents");
    expect(row).toHaveProperty("usedCents");
    expect(row).toHaveProperty("overspentCents");
    // Dead keys absent.
    expect(row).not.toHaveProperty("walletSharePercent");
    expect(row).not.toHaveProperty("walletShareAmountCents");
    expect(row).not.toHaveProperty("reserveBalanceCents");
    expect(row).not.toHaveProperty("mismatchCents");
    expect(row).not.toHaveProperty("expectedCents");
    expect(row).not.toHaveProperty("actualCents");
    // No spend → R=0, U=0, overspent=0.
    expect(row.reserveCents).toBe("0");
    expect(row.usedCents).toBe("0");
    expect(row.overspentCents).toBe("0");
  });

  it("rows carry the category colorKey (260613-v1p); colorless category → null", async () => {
    const res = await app.request(`/budgets/${fix.budgetId}/reserves`);
    const body = (await res.json()) as any;
    const grocery = body.rows.find((r: any) => r.categoryId === fix.groceryId);
    const housing = body.rows.find((r: any) => r.categoryId === fix.housingId);
    expect(grocery.colorKey).toBe("blue");
    expect(housing.colorKey).toBeNull();
  });

  it("totals carry internal/userDefined/surplus/direction and NOT the dead totals keys", async () => {
    const res = await app.request(`/budgets/${fix.budgetId}/reserves`);
    const body = (await res.json()) as any;
    const t = body.totals;
    // New totals present.
    expect(t).toHaveProperty("internalCents");
    expect(t).toHaveProperty("userDefinedCents");
    expect(t).toHaveProperty("surplusCents");
    expect(t).toHaveProperty("direction");
    expect(t).toHaveProperty("disabled");
    expect(t).toHaveProperty("budgetCurrency");
    // Dead totals absent.
    expect(t).not.toHaveProperty("mismatchCents");
    expect(t).not.toHaveProperty("totalCategoryReservesCents");
    expect(t).not.toHaveProperty("walletSharePercent");
    // userDefined = Σ RESERVE-wallet balances = 3000.00 → "300000".
    expect(t.userDefinedCents).toBe("300000");
    // No reserve set → internal 0 → surplus = userDefined → WITHDRAW.
    expect(t.internalCents).toBe("0");
    expect(t.surplusCents).toBe("300000");
    expect(["TOPUP", "WITHDRAW", "NONE"]).toContain(t.direction);
    expect(t.direction).toBe("WITHDRAW");
    expect(t.disabled).toBe(false);
    expect(t.budgetCurrency).toBe("EUR");
  });

  it("POST adjust sets reserve to target → reserveCents+deltaCents+engine summary; appends one ledger row", async () => {
    const res = await app.request(
      `/budgets/${fix.budgetId}/reserves/${fix.groceryId}/adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCents: 50000, note: "seed" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // priorR = 0 → delta = 50000 − 0 = 50000; reserve lands at target.
    expect(body.reserveCents).toBe("50000");
    expect(body.deltaCents).toBe("50000");
    // Response carries the engine summary; internal now reflects the new R.
    expect(body.summary).toBeDefined();
    expect(body.summary.totals.internalCents).toBe("50000");
    // surplus = 300000 − 50000 = 250000.
    expect(body.summary.totals.surplusCents).toBe("250000");
    const row = body.summary.rows.find(
      (r: any) => r.categoryId === fix.groceryId,
    );
    expect(row?.reserveCents).toBe("50000");

    // Exactly one adjustment row with the signed delta. The RLS tenant context
    // (set_config is_local=true) must live in the SAME transaction as the SELECT,
    // otherwise autocommit drops it before the read and RLS filters the row out.
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.tenant_ids', '{"${fix.budgetId}"}', true)`,
      );
      await client.query(
        `SELECT set_config('app.current_user_id', '${fix.userId}', true)`,
      );
      const r = await client.query(
        `SELECT delta_cents::text AS delta_cents
         FROM budgeting.category_reserve_adjustments
         WHERE tenant_id = $1::uuid AND category_id = $2::uuid`,
        [fix.budgetId, fix.groceryId],
      );
      await client.query("COMMIT");
      expect(r.rows.length).toBe(1);
      expect(String(r.rows[0].delta_cents)).toBe("50000");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("reserves_enabled=false → totals.disabled true, rows empty", async () => {
    const fix2 = await createFixture("EUR");
    const disabledApp = await buildApp(fix2.userId, fix2.budgetId, {
      isReservesEnabled: async () => false,
    });
    const res = await disabledApp.request(`/budgets/${fix2.budgetId}/reserves`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.totals.disabled).toBe(true);
    expect(body.rows.length).toBe(0);
    expect(body.excludedRows.length).toBe(0);
  });

  it("returns 401 without session", async () => {
    const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
    const noAuthApp = new Hono();
    const deps = {
      budgeting: {
        getReservesSummary: async () => {
          throw new Error("should not be called");
        },
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
    noAuthApp.route("/budgets", budgetsRoutesFactory(deps));
    const res = await noAuthApp.request(`/budgets/${fix.budgetId}/reserves`);
    expect(res.status).toBe(401);
  });

  it("returns 404 when budgetId not in tenantIds (cross-tenant gate)", async () => {
    const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
    const foreignApp = new Hono();
    const deps = {
      budgeting: {
        getReservesSummary: async () => {
          throw new Error("should not be called");
        },
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
    foreignApp.use("*", async (c: any, next: any) => {
      c.set("session", { user: { id: "attacker" } });
      c.set("tenantIds", [otherBudgetId]);
      await next();
    });
    foreignApp.route("/budgets", budgetsRoutesFactory(deps));
    const res = await foreignApp.request(`/budgets/${fix.budgetId}/reserves`);
    expect(res.status).toBe(404);
  });
});
