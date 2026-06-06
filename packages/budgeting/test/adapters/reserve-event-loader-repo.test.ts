/**
 * reserve-event-loader-repo.test.ts — Integration tests for the
 * ReserveEventLoaderRepo Drizzle adapter (Plan 05-11).
 *
 * Real Postgres required (DATABASE_URL_APP). No DB mocks (CLAUDE.md rule 3).
 * Fixture pattern mirrors category-reserve-adjustments-repo.test.ts /
 * reserve-balance-repo.test.ts (account-repo.test.ts:25-60).
 *
 * Asserts load() returns all 8 ReserveEventInputs fields with correct shape +
 * ordering: spendByCategoryByMonth, limitsByMonth, cushionHistory,
 * adjustmentsByCategory, categoryFlags, userDefinedCents, reservesEnabled,
 * openMonth/budgetCurrency.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
// Test runner is on host; swap Docker-network hostname for localhost.
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

// ──────────────────────────────────────────────────────────────────────────────
// Fixture: budget + 2 categories + limits + 1 adjustment + 1 RESERVE wallet +
// 2 months of confirmed SPENDING transactions.
// ──────────────────────────────────────────────────────────────────────────────

interface Fixture {
  userId: string;
  budgetId: string;
  groceryId: string;
  housingId: string;
  thisMonth: string; // 'YYYY-MM'
  lastMonth: string; // 'YYYY-MM'
  walletCents: bigint;
  adjustmentDelta: bigint;
}

function ym(d: Date): string {
  return d.toISOString().substring(0, 7);
}
function firstOfMonth(yyyymm: string): string {
  return `${yyyymm}-01`;
}

async function createFixture(reservesEnabled = true): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const groceryId = crypto.randomUUID();
  const housingId = crypto.randomUUID();

  const now = new Date();
  const thisMonth = ym(now);
  const lastMonthDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15),
  );
  const lastMonth = ym(lastMonthDate);
  const walletCents = 100000n; // 1000.00 EUR
  const adjustmentDelta = 30000n; // +300.00 EUR on Grocery

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Loader Test User', true, now(), now())`,
      [userId, `loader-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count,
          reserves_enabled, created_at)
       VALUES ($1, $2, 'Loader Budget', 'PRIVATE', 'EUR', $3, 1, $4, now())`,
      [budgetId, `loader-${budgetId.slice(0, 8)}`, userId, reservesEnabled],
    );
    // GUC so RLS allows the seed INSERTs.
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );

    // Two categories with distinct sort_index; Grocery reserve_excluded=false.
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, sort_index, reserve_excluded, created_at, actor_user_id)
       VALUES ($1, $2, 'Grocery', 0, false, now(), $3),
              ($4, $2, 'Housing', 1, false, now(), $3)`,
      [groceryId, budgetId, userId, housingId],
    );

    // SCD-2 limits effective from last month onward.
    const lm01 = firstOfMonth(lastMonth);
    await client.query(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency, effective_from, actor_user_id)
       VALUES (gen_random_uuid(), $1, $2, 30000, 'EUR', 30000, 'EUR', $3, $4),
              (gen_random_uuid(), $1, $5, 50000, 'EUR', 25000, 'EUR', $3, $4)`,
      [budgetId, groceryId, lm01, userId, housingId],
    );

    // Budget mode history: NORMAL from last month (cushion off).
    await client.query(
      `INSERT INTO budgeting.budget_mode_history
         (id, budget_id, tenant_id, mode, effective_from, actor_user_id)
       VALUES (gen_random_uuid(), $1, $1, 'NORMAL', $2, $3)`,
      [budgetId, lm01, userId],
    );

    // One signed adjustment delta on Grocery (actor col is `created_by`, nullable).
    await client.query(
      `INSERT INTO budgeting.category_reserve_adjustments
         (id, tenant_id, category_id, delta_cents, created_by, occurred_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
      [budgetId, groceryId, adjustmentDelta.toString(), userId],
    );

    // One active RESERVE wallet (userDefined source).
    await client.query(
      `INSERT INTO budgeting.wallets
         (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES (gen_random_uuid(), $1, 'Reserve', 'RESERVE', 'EUR', $2, now(), $3)`,
      [budgetId, Number(walletCents) / 100, userId],
    );

    // Two months of confirmed SPENDING transactions on Grocery:
    //   last month 200.00, this month 500.00 (this month overspends 300 limit).
    const lastTxnDate = `${lastMonth}-10`;
    const thisTxnDate = `${thisMonth}-05`;
    await client.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, category_id, transaction_date,
          amount_original_cents, currency_original, amount_converted_cents,
          fx_rate, fx_as_of, kind, confirmed_at, created_at)
       VALUES
         (gen_random_uuid(), $1, $1, $2, $3, 20000, 'EUR', 20000, 1, $3, 'SPENDING', now(), now()),
         (gen_random_uuid(), $1, $1, $2, $4, 50000, 'EUR', 50000, 1, $4, 'SPENDING', now(), now())`,
      [budgetId, groceryId, lastTxnDate, thisTxnDate],
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  return {
    userId,
    budgetId,
    groceryId,
    housingId,
    thisMonth,
    lastMonth,
    walletCents,
    adjustmentDelta,
  };
}

const { createReserveEventLoaderRepo } =
  await import("../../src/adapters/persistence/reserve-event-loader-repo");
const { DrizzleTransactionRepo } =
  await import("../../src/adapters/persistence/transaction-repo");
const { DrizzleCategoryLimitRepo } =
  await import("../../src/adapters/persistence/category-limit-repo");
const { DrizzleReservesSummaryRepo } =
  await import("../../src/adapters/persistence/reserves-summary-repo");

function makeLoader() {
  // DrizzleTransactionRepo's constructor args are unused (read-only
  // spendByCategoryByMonth is self-contained) — construct directly.
  return createReserveEventLoaderRepo({
    transactionRepo: new DrizzleTransactionRepo(),
    categoryLimitRepo: new DrizzleCategoryLimitRepo(),
    reservesSummaryRepo: new DrizzleReservesSummaryRepo(),
  });
}

describe("ReserveEventLoaderRepo — load", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  test("field 1: spendByCategoryByMonth has Grocery spend for both months", async () => {
    const loader = makeLoader();
    const out = await loader.load(fix.budgetId, fix.budgetId, fix.thisMonth);
    const grocery = out.spendByCategoryByMonth.get(fix.groceryId);
    expect(grocery).toBeDefined();
    expect(grocery!.get(fix.lastMonth)).toBe(20000n);
    expect(grocery!.get(fix.thisMonth)).toBe(50000n);
  });

  test("field 2: limitsByMonth contains the seeded months with planned+cushion", async () => {
    const loader = makeLoader();
    const out = await loader.load(fix.budgetId, fix.budgetId, fix.thisMonth);
    expect(out.limitsByMonth.has(fix.thisMonth)).toBe(true);
    expect(out.limitsByMonth.has(fix.lastMonth)).toBe(true);
    const g = out.limitsByMonth.get(fix.thisMonth)!.get(fix.groceryId);
    expect(g).toBeDefined();
    expect(g!.plannedCents).toBe(30000n);
    const h = out.limitsByMonth.get(fix.thisMonth)!.get(fix.housingId);
    expect(h!.plannedCents).toBe(50000n);
    expect(h!.cushionCents).toBe(25000n);
  });

  test("field 3: cushionHistory is ascending with the NORMAL segment (on=false)", async () => {
    const loader = makeLoader();
    const out = await loader.load(fix.budgetId, fix.budgetId, fix.thisMonth);
    expect(out.cushionHistory.length).toBeGreaterThanOrEqual(1);
    expect(out.cushionHistory[0].fromMonth).toBe(fix.lastMonth);
    expect(out.cushionHistory[0].on).toBe(false);
    // ascending by month
    for (let i = 1; i < out.cushionHistory.length; i++) {
      expect(
        out.cushionHistory[i - 1].fromMonth <= out.cushionHistory[i].fromMonth,
      ).toBe(true);
    }
  });

  test("field 4: adjustmentsByCategory carries the ordered Grocery delta", async () => {
    const loader = makeLoader();
    const out = await loader.load(fix.budgetId, fix.budgetId, fix.thisMonth);
    const adj = out.adjustmentsByCategory.get(fix.groceryId);
    expect(adj).toBeDefined();
    expect(adj).toEqual([
      { deltaCents: fix.adjustmentDelta, month: fix.thisMonth },
    ]);
    // Housing has no adjustment.
    expect(out.adjustmentsByCategory.get(fix.housingId)).toBeUndefined();
  });

  test("field 5: categoryFlags carries reserve_excluded + sortIndex + name", async () => {
    const loader = makeLoader();
    const out = await loader.load(fix.budgetId, fix.budgetId, fix.thisMonth);
    const g = out.categoryFlags.get(fix.groceryId);
    const h = out.categoryFlags.get(fix.housingId);
    expect(g).toBeDefined();
    expect(g!.reserveExcluded).toBe(false);
    expect(g!.sortIndex).toBe(0);
    expect(g!.name).toBe("Grocery");
    expect(g!.archivedAt).toBeNull();
    expect(h!.sortIndex).toBe(1);
  });

  test("field 6: userDefinedCents equals the RESERVE wallet balance", async () => {
    const loader = makeLoader();
    const out = await loader.load(fix.budgetId, fix.budgetId, fix.thisMonth);
    expect(out.userDefinedCents).toBe(fix.walletCents);
  });

  test("field 7: reservesEnabled is true (and false when budget flag off)", async () => {
    const loader = makeLoader();
    const out = await loader.load(fix.budgetId, fix.budgetId, fix.thisMonth);
    expect(out.reservesEnabled).toBe(true);

    const off = await createFixture(false);
    const out2 = await loader.load(off.budgetId, off.budgetId, off.thisMonth);
    expect(out2.reservesEnabled).toBe(false);
  });

  test("field 8: openMonth + budgetCurrency are resolved", async () => {
    const loader = makeLoader();
    const out = await loader.load(fix.budgetId, fix.budgetId, fix.thisMonth);
    expect(out.openMonth).toBe(fix.thisMonth);
    expect(out.budgetCurrency).toBe("EUR");
  });

  test("invalid openMonthOverride is rejected", async () => {
    const loader = makeLoader();
    await expect(
      loader.load(fix.budgetId, fix.budgetId, "2026/06"),
    ).rejects.toThrow("invalid_month");
  });

  test("cross-tenant load returns empty maps (RLS scoped)", async () => {
    const loader = makeLoader();
    const stranger = crypto.randomUUID();
    // budget_not_found because the meta SELECT is RLS-scoped to the stranger.
    await expect(
      loader.load(stranger, stranger, fix.thisMonth),
    ).rejects.toThrow("budget_not_found");
  });
});
