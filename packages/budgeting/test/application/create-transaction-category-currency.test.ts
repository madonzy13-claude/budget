/**
 * create-transaction-category-currency.test.ts — D-05 server default: a
 * transaction entered without a currency takes its CATEGORY's currency, not
 * the budget's. An explicit currency still wins.
 * Real Postgres — run under `infisical run --env=dev`.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { createTransaction } from "../../src/application/create-transaction";
import { DrizzleTransactionRepo } from "../../src/adapters/persistence/transaction-repo";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER"] as const) {
  if (process.env[k]) process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

const TENANT = crypto.randomUUID();
const USER = crypto.randomUUID();
const EUR_CAT = crypto.randomUUID();

async function asApp<T>(fn: (p: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.current_user_id', $1, false), set_config('app.tenant_ids', $2, false)`, [
      USER,
      `{${TENANT}}`,
    ]);
    return await fn(c as unknown as Pool);
  } finally {
    c.release();
    await pool.end();
  }
}

describe.skipIf(!process.env.DATABASE_URL_APP)("Transaction currency default", () => {
  beforeAll(async () => {
    await asApp(async (db) => {
      await db.query(
        `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'Ccy Tx', true, now(), now())`,
        [USER, `ccy-tx-${USER.slice(0, 8)}@example.com`],
      );
      await db.query(
        `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
         VALUES ($1, $2, 'Ccy Tx', 'PRIVATE', 'PLN', $3, 1, now())`,
        [TENANT, `ccy-tx-${TENANT.slice(0, 8)}`, USER],
      );
      await db.query(
        `INSERT INTO budgeting.categories (id, tenant_id, name, currency, created_at, actor_user_id)
         VALUES ($1, $2, 'Trips', 'EUR', now(), $3)`,
        [EUR_CAT, TENANT, USER],
      );
    });
  });

  afterAll(async () => {
    await asApp(async (db) => {
      await db.query(`DELETE FROM budgeting.expense_ledger WHERE tenant_id = $1`, [TENANT]).catch(() => {});
      await db.query(`DELETE FROM budgeting.category_limits WHERE tenant_id = $1`, [TENANT]).catch(() => {});
      await db.query(`DELETE FROM budgeting.categories WHERE tenant_id = $1`, [TENANT]).catch(() => {});
      await db.query(`DELETE FROM tenancy.budgets WHERE id = $1`, [TENANT]).catch(() => {});
    });
  });

  const repo = new DrizzleTransactionRepo();
  const create = createTransaction({
    transactionRepo: repo,
    fxProvider: { rateAsOf: async () => ({ rate: "4.3", provider: "test", isStale: false }) },
    getBudgetCurrency: async () => "PLN",
  });
  const base = { date: "2026-10-05", categoryId: EUR_CAT, budgetId: TENANT, tenantId: TENANT, actorUserId: USER };

  test("takes the category's currency when none is given", async () => {
    const r = await create({ ...base, amountOriginalCents: 1234 });
    const row = r._unsafeUnwrap().transaction;
    expect(row.currencyOriginal).toBe("EUR");
    expect(row.amountOriginalCents).toBe("1234");
    const stored = await repo.findById(TENANT, row.id);
    expect(stored?.currencyOriginal).toBe("EUR");
  });

  // Owner, 261104: a month keeps the currency it had. Trips is EUR today but
  // its September segment is PLN, so a September spend defaults to PLN.
  test("a date in a month with another currency takes that month's", async () => {
    await asApp(async (db) => {
      await db.query(
        `INSERT INTO budgeting.category_limits (id, tenant_id, category_id, normal_amount, normal_currency,
           cushion_amount, cushion_currency, effective_from, effective_to, actor_user_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, 40000, 'PLN', 0, 'PLN', '2026-09-01', '2026-09-30', $3, now())`,
        [TENANT, EUR_CAT, USER],
      );
    });
    const r = await create({ ...base, date: "2026-09-15", amountOriginalCents: 700 });
    expect(r._unsafeUnwrap().transaction.currencyOriginal).toBe("PLN");
  });

  test("an explicit currency wins over the category's", async () => {
    const r = await create({ ...base, amountOriginalCents: 500, currencyOriginal: "USD" });
    expect(r._unsafeUnwrap().transaction.currencyOriginal).toBe("USD");
  });
});
