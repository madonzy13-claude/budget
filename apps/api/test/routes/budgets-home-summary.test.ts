/**
 * budgets-home-summary.test.ts — Integration tests for HOME-02.
 *
 * Boots the BudgetHomeSummaryRepo adapter against real Postgres, mounts the
 * /budgets/:id/home-summary route, and asserts the contract:
 *   - empty wallets → "0"
 *   - mixed-currency wallets → FX-converted server-side via FxProvider
 *   - top-2 overspent categories sorted DESC
 *   - empty top_overspent when nothing overspent
 *   - tenant guard rejects user A reading user B's budget id
 *   - cushion_mode_enabled toggles cushion_amount vs normal_amount
 *
 * Requires DATABASE_URL_APP (set by `infisical run` or `make test`).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

// Reset the platform pool so it picks up the rewritten URL.
const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  budgetId: string;
  currency: string; // default_currency
}

async function createFixture(
  currency = "USD",
  cushionModeEnabled = false,
): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Home Test', true, now(), now())`,
      [userId, `home-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, cushion_mode_enabled)
       VALUES ($1, $2, 'Home Budget', 'PRIVATE', $3, $4, 1, now(), $5)`,
      [
        budgetId,
        `ws-home-${budgetId.slice(0, 8)}`,
        currency,
        userId,
        cushionModeEnabled,
      ],
    );
    // Membership row — required for the route's tenantIds membership check.
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
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
  return { userId, budgetId, currency };
}

async function setUserDisplayCurrency(
  userId: string,
  displayCurrency: string,
): Promise<void> {
  // display_currency lives on identity.users (NOT on identity.user_preferences,
  // which only stores active_workspace_ids).
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `UPDATE identity.users SET display_currency = $1, updated_at = now() WHERE id = $2::uuid`,
      [displayCurrency, userId],
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

async function seedWallet(
  budgetId: string,
  userId: string,
  walletType: string,
  currency: string,
  balanceDecimal: string,
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
        `W-${currency}-${walletType}`,
        walletType,
        currency,
        balanceDecimal,
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

async function seedCategory(
  budgetId: string,
  userId: string,
  name: string,
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, $3, now(), $4)`,
      [id, budgetId, name, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return id;
}

async function seedLimit(
  budgetId: string,
  userId: string,
  categoryId: string,
  normalCents: number,
  cushionCents: number,
  currency: string,
  effectiveFrom: string,
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
      `INSERT INTO budgeting.category_limits
         (tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency, effective_from, actor_user_id)
       VALUES ($1, $2, $3, $4, $5, $4, $6::date, $7)`,
      [
        budgetId,
        categoryId,
        normalCents,
        currency,
        cushionCents,
        effectiveFrom,
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

async function seedTransaction(
  budgetId: string,
  userId: string,
  categoryId: string,
  date: string,
  amountCents: number,
  currency: string,
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
      `INSERT INTO budgeting.expense_ledger
         (tenant_id, budget_id, category_id, amount_original_cents, currency_original,
          amount_converted_cents, fx_rate, fx_as_of, transaction_date, kind, confirmed_at)
       VALUES ($1, $1, $2, $3, $4, $3, 1.0, $5::date, $5::date, 'SPENDING', now())`,
      [budgetId, categoryId, amountCents, currency, date],
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

async function setBudgetCushionMode(
  budgetId: string,
  enabled: boolean,
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    await client.query(
      `UPDATE tenancy.budgets SET cushion_mode_enabled = $1 WHERE id = $2::uuid`,
      [enabled, budgetId],
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

/**
 * Build a Hono app with budgetsRoutesFactory wired against the real adapter +
 * application service. Tenant guard is stubbed to set tenantIds = [budgetId]
 * for the authenticated user (mimicking the real middleware behaviour for
 * the budget we just seeded).
 */
async function buildApp(opts: {
  userId: string;
  allowedTenantIds: string[]; // ids the request will be authorised against
  // Optional FX rates used by the in-memory FxProvider; key format "USD->PLN".
  fxRates?: Record<string, string>;
}) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
  const { createBudgetHomeSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/budget-home-summary-repo");
  const { getBudgetHomeSummary } =
    await import("@budget/budgeting/src/application/get-budget-home-summary");
  const { DrizzleUserRepo } =
    await import("@budget/identity/src/adapters/persistence/user-repo");
  const { UserId, InMemoryFxProvider } = await import("@budget/shared-kernel");

  const summaryRepo = createBudgetHomeSummaryRepo();
  // Use an in-memory FxProvider (real adapter writes through fx_rate_cache; the
  // integration test pins rates deterministically for the FX assertion).
  const fxProvider = new InMemoryFxProvider(opts.fxRates ?? {});
  const userRepo = new DrizzleUserRepo();
  const displayCurrencyReader = {
    getDisplayCurrency: async (userId: string) => {
      const u = await userRepo.findById(UserId(userId));
      return u?.display_currency ?? null;
    },
  };
  const getHomeSummary = getBudgetHomeSummary({
    summaryRepo,
    fxProvider,
    displayCurrencyReader,
  });

  // Minimal deps stub matching budgetsRoutesFactory's reads.
  const deps = {
    budgeting: {
      reserveBalanceRepo: { getForBudget: async () => new Map() },
      getBudgetHomeSummary: getHomeSummary,
    },
    tenancy: {
      workspaceRepo: { listForUser: async () => [] },
      memberShareRepo: { update: async () => {} },
    },
    identity: {
      auth: { api: {} },
      userRepo: { setActiveWorkspaceIds: async () => {} },
    },
    env: { APP_URL: "http://localhost:3000" },
    emailSender: { send: async () => {} },
  } as any;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: opts.userId } });
    c.set("tenantIds", opts.allowedTenantIds);
    await next();
  });
  app.route("/budgets", budgetsRoutesFactory(deps));
  return app;
}

describe("GET /budgets/:id/home-summary", () => {
  let fixA: Fixture;

  beforeAll(async () => {
    fixA = await createFixture("USD", false);
  });

  it("returns 200 with empty wallets and zero spend for a fresh budget", async () => {
    const app = await buildApp({
      userId: fixA.userId,
      allowedTenantIds: [fixA.budgetId],
    });
    const res = await app.request(`/budgets/${fixA.budgetId}/home-summary`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.budgetId).toBe(fixA.budgetId);
    expect(body.name).toBe("Home Budget");
    expect(body.kind).toBe("PRIVATE");
    expect(body.default_currency).toBe("USD");
    // No display_currency preference set → falls back to default_currency.
    expect(body.display_currency).toBe("USD");
    expect(body.spent_current_month.amount_cents).toBe("0");
    expect(body.wallets_value_display_ccy.amount_cents).toBe("0");
    expect(body.wallets_value_display_ccy.currency).toBe("USD");
    expect(body.top_overspent).toEqual([]);
  });

  it("FX-converts mixed-currency wallets to user's display_currency", async () => {
    const fix = await createFixture("USD", false);
    // 3 wallets in 3 currencies; display_currency = PLN.
    await seedWallet(fix.budgetId, fix.userId, "SPENDINGS", "USD", "100.0000"); // $100 → 400 PLN
    await seedWallet(fix.budgetId, fix.userId, "CUSHION", "EUR", "200.0000"); // €200 → 880 PLN
    await seedWallet(fix.budgetId, fix.userId, "RESERVE", "PLN", "50.0000"); // 50 PLN unchanged
    await setUserDisplayCurrency(fix.userId, "PLN");

    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
      fxRates: { "USD->PLN": "4", "EUR->PLN": "4.4" },
    });
    const res = await app.request(`/budgets/${fix.budgetId}/home-summary`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.display_currency).toBe("PLN");
    expect(body.wallets_value_display_ccy.currency).toBe("PLN");
    // $100×4 + €200×4.4 + 50 PLN = 400 + 880 + 50 = 1330 PLN = 133000 cents
    expect(body.wallets_value_display_ccy.amount_cents).toBe("133000");
    expect(body.wallets_value_display_ccy.converted_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("returns top-2 overspent categories sorted DESC by over_amount_cents", async () => {
    const fix = await createFixture("USD", false);
    const cats: Array<{ id: string; over: number }> = [];
    const today = new Date();
    const monthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    )
      .toISOString()
      .slice(0, 10);
    const txnDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 5),
    )
      .toISOString()
      .slice(0, 10);
    // 5 categories with varying overspends.
    const overspends = [
      { name: "Groceries", limit: 10000, spend: 25000, over: 15000 },
      { name: "Dining", limit: 5000, spend: 8000, over: 3000 },
      { name: "Transit", limit: 2000, spend: 12000, over: 10000 },
      { name: "Coffee", limit: 1000, spend: 1500, over: 500 },
      { name: "Entertainment", limit: 4000, spend: 20000, over: 16000 },
    ];
    for (const o of overspends) {
      const catId = await seedCategory(fix.budgetId, fix.userId, o.name);
      await seedLimit(
        fix.budgetId,
        fix.userId,
        catId,
        o.limit,
        o.limit,
        "USD",
        monthStart,
      );
      await seedTransaction(
        fix.budgetId,
        fix.userId,
        catId,
        txnDate,
        o.spend,
        "USD",
      );
      cats.push({ id: catId, over: o.over });
    }

    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(`/budgets/${fix.budgetId}/home-summary`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.top_overspent.length).toBe(2);
    // DESC by over_amount_cents → Entertainment (16000) then Groceries (15000).
    expect(body.top_overspent[0].category_name).toBe("Entertainment");
    expect(body.top_overspent[0].over_amount_cents).toBe("16000");
    expect(body.top_overspent[1].category_name).toBe("Groceries");
    expect(body.top_overspent[1].over_amount_cents).toBe("15000");
  });

  it("returns empty top_overspent when no category is overspent", async () => {
    const fix = await createFixture("USD", false);
    const today = new Date();
    const monthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    )
      .toISOString()
      .slice(0, 10);
    const txnDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 5),
    )
      .toISOString()
      .slice(0, 10);
    const catId = await seedCategory(fix.budgetId, fix.userId, "Healthy Cat");
    await seedLimit(
      fix.budgetId,
      fix.userId,
      catId,
      100000,
      100000,
      "USD",
      monthStart,
    );
    await seedTransaction(
      fix.budgetId,
      fix.userId,
      catId,
      txnDate,
      5000,
      "USD",
    );

    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(`/budgets/${fix.budgetId}/home-summary`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.top_overspent).toEqual([]);
    expect(body.spent_current_month.amount_cents).toBe("5000");
  });

  it("returns 404 when user is not a member of the requested budget (tenant guard)", async () => {
    const fixB = await createFixture("USD", false);
    // User A authenticated, but tenant guard resolved no tenantIds for budget B
    // (because A is not a member of B). Route MUST 404, NEVER leak B's data.
    const app = await buildApp({
      userId: fixA.userId,
      allowedTenantIds: [], // tenant-guard rejected B for user A
    });
    const res = await app.request(`/budgets/${fixB.budgetId}/home-summary`);
    expect([403, 404]).toContain(res.status);
    // Body MUST NOT include B's name or any budget details.
    const text = await res.text();
    expect(text).not.toContain("Home Budget");
    expect(text).not.toContain(fixB.budgetId);
  });

  it("uses cushion_amount when budget.cushion_mode_enabled is true", async () => {
    const fix = await createFixture("USD", true); // cushion mode ON
    const today = new Date();
    const monthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    )
      .toISOString()
      .slice(0, 10);
    const txnDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 5),
    )
      .toISOString()
      .slice(0, 10);
    const catId = await seedCategory(fix.budgetId, fix.userId, "Toggle Cat");
    // normal limit 10_000; cushion limit 5_000; spend 8_000.
    // useCushion=true → over = max(0, 8000 - 5000) = 3000
    // useCushion=false (cushion off) → over = max(0, 8000 - 10000) = 0
    await seedLimit(
      fix.budgetId,
      fix.userId,
      catId,
      10000,
      5000,
      "USD",
      monthStart,
    );
    await seedTransaction(
      fix.budgetId,
      fix.userId,
      catId,
      txnDate,
      8000,
      "USD",
    );

    // Cushion ON → should overspend against cushion (5_000)
    const appOn = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const resOn = await appOn.request(`/budgets/${fix.budgetId}/home-summary`);
    const bodyOn = (await resOn.json()) as any;
    expect(bodyOn.top_overspent.length).toBe(1);
    expect(bodyOn.top_overspent[0].over_amount_cents).toBe("3000");

    // Cushion OFF → should NOT overspend against normal (10_000)
    await setBudgetCushionMode(fix.budgetId, false);
    const appOff = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const resOff = await appOff.request(
      `/budgets/${fix.budgetId}/home-summary`,
    );
    const bodyOff = (await resOff.json()) as any;
    expect(bodyOff.top_overspent).toEqual([]);
  });
});
