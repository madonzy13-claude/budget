/**
 * spendings-summary.test.ts — Integration tests for GET /budgets/:budgetId/spendings-summary
 * Real Postgres. TDD plan 04-02 Task 2.
 *
 * Covers:
 *   - Empty categories → 200 with empty array and budgetTz
 *   - categories with limits → planned/cushion/activeBudget populated
 *   - reserve-overflow cascade: spent > active + reserve → overspent > 0 (RSCM-04)
 *   - budgetTz from tenancy.budgets.timezone (D-PH4-Q5)
 *   - tenant-leak: wrong budgetId → 403
 *   - missing month param → 422
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
}

async function createFixture(currency = "EUR", tz = "UTC"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'SS Test', true, now(), now())`,
      [userId, `ss-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, timezone)
       VALUES ($1, $2, 'SS Budget', 'PRIVATE', $3, $4, 1, now(), $5)`,
      [budgetId, `ws-ss-${budgetId.slice(0, 8)}`, currency, userId, tz],
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
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{"${budgetId}"}`,
    ]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, $3, now(), $4)`,
      [id, budgetId, name, userId],
    );
    await client.query("COMMIT");
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
  effectiveFrom: string,
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{"${budgetId}"}`,
    ]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    await client.query(
      `INSERT INTO budgeting.category_limits
         (tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency, effective_from, actor_user_id)
       VALUES ($1, $2, $3, 'EUR', $4, 'EUR', $5::date, $6)`,
      [budgetId, categoryId, normalCents, cushionCents, effectiveFrom, userId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedTransaction(
  budgetId: string,
  userId: string,
  categoryId: string,
  amountCents: number,
  date: string,
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{"${budgetId}"}`,
    ]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    await client.query(
      `INSERT INTO budgeting.expense_ledger
         (tenant_id, budget_id, category_id, amount_original_cents, currency_original,
          amount_converted_cents, fx_rate, fx_as_of, transaction_date, kind, confirmed_at)
       VALUES ($1, $1, $2, $3, 'EUR', $3, 1.0, $4::date, $4::date, 'SPENDING', now())`,
      [budgetId, categoryId, amountCents, date],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
}

async function buildApp(userId: string, budgetId: string) {
  const { createSpendingsSummaryRoute } =
    await import("../../src/routes/spendings-summary");
  const { DrizzleCategoryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/category-repo");
  const { DrizzleCategoryLimitRepo } =
    await import("@budget/budgeting/src/adapters/persistence/category-limit-repo");
  const { DrizzleTransactionRepo } =
    await import("@budget/budgeting/src/adapters/persistence/transaction-repo");
  const { DrizzleReservesSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/reserves-summary-repo");
  const { createSpendingsSummaryRepo } =
    await import("@budget/budgeting/src/adapters/persistence/spendings-summary-repo");
  const { getSpendingsSummary } =
    await import("@budget/budgeting/src/application/get-spendings-summary");
  // 05-12/05-14: reserveUsed/overspent for the viewed month come from the engine
  // via the replay orchestrator (event-loader → reserve-engine), NOT the dropped
  // VIEW-backed reserveBalanceRepo. Wire the real orchestrator so the route
  // exercises the production read path end-to-end against Postgres.
  const { getReservePositions } =
    await import("@budget/budgeting/src/application/get-reserve-positions");
  const { createReserveEventLoaderRepo } =
    await import("@budget/budgeting/src/adapters/persistence/reserve-event-loader-repo");
  const { DrizzleSpendingProjectionRepo } =
    await import("@budget/budgeting/src/adapters/persistence/spending-projection-repo");

  const categoryRepo = new DrizzleCategoryRepo();
  const categoryLimitRepo = new DrizzleCategoryLimitRepo();
  const transactionRepo = new DrizzleTransactionRepo();
  const reservesSummaryRepo = new DrizzleReservesSummaryRepo();
  const summaryRepo = createSpendingsSummaryRepo();
  const reservePositions = getReservePositions({
    eventLoader: createReserveEventLoaderRepo({
      transactionRepo: new DrizzleTransactionRepo(
        undefined,
        new DrizzleSpendingProjectionRepo(),
      ),
      categoryLimitRepo,
      reservesSummaryRepo,
    }),
  });

  const deps = {
    budgeting: {
      getSpendingsSummary: getSpendingsSummary({
        categoryRepo,
        categoryLimitRepo,
        transactionRepo,
        summaryRepo,
        reservePositions,
      }),
    },
  } as unknown as import("../../src/boot").BootedDeps;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [budgetId]);
    c.set("userId", userId);
    await next();
  });
  app.route(
    "/budgets/:budgetId/spendings-summary",
    createSpendingsSummaryRoute(deps),
  );
  return app;
}

describe("GET /budgets/:budgetId/spendings-summary", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture("EUR", "Europe/Warsaw");
  });

  it("returns 200 with budgetTz and empty categories for fresh budget", async () => {
    const app = await buildApp(fix.userId, fix.budgetId);
    const res = await app.request(
      `/budgets/${fix.budgetId}/spendings-summary?month=2026-05`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.month).toBe("2026-05");
    expect(body.budgetCurrency).toBe("EUR");
    expect(body.budgetTz).toBe("Europe/Warsaw");
    expect(body.cushionModeEnabled).toBe(false);
    expect(Array.isArray(body.categories)).toBe(true);
  });

  it("returns category with correct planned/cushion/spent math", async () => {
    const localFix = await createFixture("EUR", "UTC");
    const catId = await seedCategory(
      localFix.budgetId,
      localFix.userId,
      "Housing",
    );
    await seedLimit(
      localFix.budgetId,
      localFix.userId,
      catId,
      100000,
      120000,
      "2026-01-01",
    );
    await seedTransaction(
      localFix.budgetId,
      localFix.userId,
      catId,
      60000,
      "2026-05-10",
    );

    const app = await buildApp(localFix.userId, localFix.budgetId);
    const res = await app.request(
      `/budgets/${localFix.budgetId}/spendings-summary?month=2026-05`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const cat = body.categories.find((c: any) => c.categoryId === catId);
    expect(cat).toBeDefined();
    expect(cat.plannedCents).toBe("100000");
    expect(cat.cushionCents).toBe("120000");
    expect(cat.activeBudgetCents).toBe("100000"); // cushion_mode_enabled=false → planned
    expect(cat.spentCents).toBe("60000");
    // 05-12/05-14 engine shape: reserveUsed/overspent/balance per category.
    expect(cat).toHaveProperty("reserveUsedCents");
    expect(cat.reserveUsedCents).toBe("0"); // no reserve set → nothing drawn
    expect(cat.overspentCents).toBe("0");
    expect(cat.balanceCents).toBe("40000"); // 100000 - 60000
    // reserveAvailableCents = used + free reserve at the month's end, EXCLUDING the
    // month's OWN accrual (the 400 underspend is for next month, not this one) → 0 / 0.
    expect(cat).toHaveProperty("reserveAvailableCents");
    expect(cat.reserveAvailableCents).toBe("0");
  });

  it("reserve-overflow: spent > active + reserve → overspentCents > 0 (RSCM-04)", async () => {
    const localFix = await createFixture("EUR", "UTC");
    const catId = await seedCategory(
      localFix.budgetId,
      localFix.userId,
      "Overspent Cat",
    );
    // Use effective_from = 2026-05-01 so NO reserve accumulates from prior months.
    // planned = 10000, cushion = 12000
    await seedLimit(
      localFix.budgetId,
      localFix.userId,
      catId,
      10000,
      12000,
      "2026-05-01",
    );
    // spent = 15000 → overBy = 5000, no prior-month reserve → overspent = 5000
    await seedTransaction(
      localFix.budgetId,
      localFix.userId,
      catId,
      15000,
      "2026-05-10",
    );

    const app = await buildApp(localFix.userId, localFix.budgetId);
    const res = await app.request(
      `/budgets/${localFix.budgetId}/spendings-summary?month=2026-05`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const cat = body.categories.find((c: any) => c.categoryId === catId);
    expect(cat).toBeDefined();
    expect(cat.spentCents).toBe("15000");
    expect(cat.plannedCents).toBe("10000");
    // With effective_from=2026-05-01 (same month), reserve accumulation from prior months = 0.
    // reserveUsed = min(overBy=5000, reserve=0) = 0, so overspentCents = 5000.
    expect(cat.overspentCents).toBe("5000");
  });

  it("returns 400 for missing month param (zod-validator)", async () => {
    const app = await buildApp(fix.userId, fix.budgetId);
    const res = await app.request(`/budgets/${fix.budgetId}/spendings-summary`);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid month format (zod-validator)", async () => {
    const app = await buildApp(fix.userId, fix.budgetId);
    const res = await app.request(
      `/budgets/${fix.budgetId}/spendings-summary?month=2026-5`,
    );
    expect(res.status).toBe(400);
  });

  it("tenant-leak: wrong budgetId → 403 (D-PH4-E3)", async () => {
    const otherBudgetId = crypto.randomUUID();
    const app = await buildApp(fix.userId, fix.budgetId);
    const res = await app.request(
      `/budgets/${otherBudgetId}/spendings-summary?month=2026-05`,
    );
    expect(res.status).toBe(403);
  });
});
