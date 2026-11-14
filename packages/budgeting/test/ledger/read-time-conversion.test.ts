/**
 * read-time-conversion.test.ts — D-02 / D-03 on real Postgres.
 *
 * Every ledger total re-expresses in the budget's CURRENT currency, each row at
 * its OWN date's rate; the ledger rows themselves never change. A→B→A is
 * lossless because nothing stored is rewritten.
 *
 * Fixture: PLN budget, Food (PLN). A = 100.00 PLN on D1, B = 10.00 EUR on D2.
 * Rates differ on D1, D2 and a LATER date so a wrong date shows. All dates sit
 * in 1999, before the real FX history, so seeding never touches a real rate.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { DrizzleTransactionRepo } from "../../src/adapters/persistence/transaction-repo";
import { seedFxRates, deleteFxRates } from "../fx-seed";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER", "DATABASE_URL_MIGRATOR"] as const) {
  if (process.env[k]) process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

const TENANT = crypto.randomUUID();
const USER = crypto.randomUUID();
const FOOD = crypto.randomUUID();
const PROVIDER = `test-14-06-${crypto.randomUUID()}`;
const D1 = "1999-03-01";
const D2 = "1999-03-10";
const LATER = "1999-03-20";
const MONTH_START = "1999-03-01";
const MONTH_END = "1999-04-01";

async function asApp<T>(fn: (p: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  const c = await pool.connect();
  try {
    await c.query(
      `SELECT set_config('app.current_user_id', $1, false), set_config('app.tenant_ids', $2, false)`,
      [USER, `{${TENANT}}`],
    );
    return await fn(c as unknown as Pool);
  } finally {
    c.release();
    await pool.end();
  }
}

/** Until plan 19 removes the lock, the budget currency changes straight in the DB. */
async function setBudgetCurrency(ccy: string) {
  await asApp((db) =>
    db.query(`UPDATE tenancy.budgets SET default_currency = $1 WHERE id = $2`, [ccy, TENANT]),
  );
}

const ledgerSnapshot = () =>
  asApp(async (db) =>
    (
      await db.query(
        `SELECT row_to_json(l)::text AS j FROM budgeting.expense_ledger l
          WHERE tenant_id = $1 ORDER BY id`,
        [TENANT],
      )
    ).rows.map((r) => r.j as string),
  );

const repo = new DrizzleTransactionRepo();
const foodTotal = async () =>
  (await repo.spendByCategoryForMonth(TENANT, TENANT, MONTH_START, MONTH_END)).get(FOOD);

describe.skipIf(!process.env.DATABASE_URL_APP)("Read-time conversion of the ledger", () => {
  beforeAll(async () => {
    await seedFxRates(
      [
        { base: "EUR", quote: "PLN", date: D1, rate: "4.0" },
        { base: "PLN", quote: "EUR", date: D1, rate: "0.25" },
        { base: "EUR", quote: "PLN", date: D2, rate: "4.5" },
        { base: "PLN", quote: "EUR", date: D2, rate: "0.2222" },
        { base: "EUR", quote: "PLN", date: LATER, rate: "5.0" },
        { base: "PLN", quote: "EUR", date: LATER, rate: "0.2" },
      ],
      PROVIDER,
    );
    await asApp(async (db) => {
      await db.query(
        `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'Read Time', true, now(), now())`,
        [USER, `read-time-${USER.slice(0, 8)}@example.com`],
      );
      await db.query(
        `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
         VALUES ($1, $2, 'Read Time', 'PRIVATE', 'PLN', $3, 1, now())`,
        [TENANT, `read-time-${TENANT.slice(0, 8)}`, USER],
      );
      await db.query(
        `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
         VALUES ($1, $2, 'Food', now(), $3)`,
        [FOOD, TENANT, USER],
      );
      // Stored converted cents are deliberately WRONG: nothing may read them.
      for (const [date, cents, ccy] of [
        [D1, "10000", "PLN"],
        [D2, "1000", "EUR"],
      ] as const) {
        await db.query(
          `INSERT INTO budgeting.expense_ledger
             (id, tenant_id, budget_id, category_id, transaction_date, amount_original_cents,
              currency_original, amount_converted_cents, fx_rate, fx_as_of, kind,
              confirmed_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $1, $2, $3::date, $4::bigint, $5, 999999, 1, $3::date,
                   'SPENDING', now(), now(), now())`,
          [TENANT, FOOD, date, cents, ccy],
        );
      }
    });
  });

  afterAll(async () => {
    await setBudgetCurrency("PLN");
    await asApp(async (db) => {
      await db.query(`DELETE FROM budgeting.expense_ledger WHERE tenant_id = $1`, [TENANT]);
      await db.query(`DELETE FROM budgeting.categories WHERE tenant_id = $1`, [TENANT]);
      await db.query(`DELETE FROM tenancy.budgets WHERE id = $1`, [TENANT]);
    });
    await deleteFxRates(PROVIDER);
  });

  test("totals in the budget currency convert each row at its own date", async () => {
    // 10000 PLN + 1000 EUR × 4.5 (D2) = 14500.
    expect(await foodTotal()).toBe(14500n);
  });

  test("after a switch to EUR every total is in EUR at each row's date, ledger untouched", async () => {
    const before = await ledgerSnapshot();
    await setBudgetCurrency("EUR");
    try {
      // 10000 PLN × 0.25 (D1) + 1000 EUR = 3500 — not 11000, not the LATER rate.
      expect(await foodTotal()).toBe(3500n);
      const byDay = await repo.spendByDayForMonth(TENANT, TENANT, MONTH_START, MONTH_END);
      expect(byDay).toEqual([
        { date: D1, cents: 2500n },
        { date: D2, cents: 1000n },
      ]);
      const byMonth = await repo.spendByCategoryByMonth(TENANT, TENANT, MONTH_END);
      expect(byMonth.get(FOOD)?.get("1999-03")).toBe(3500n);

      const rows = await repo.listForMonth(TENANT, TENANT, "1999-03", "any");
      const a = rows.find((r) => r.date === D1)!;
      expect(a.amountOriginalCents).toBe("10000");
      expect(a.currencyOriginal).toBe("PLN");
      expect(a.amountConvertedCents).toBe("2500");
      expect(a.currencyConverted).toBe("EUR");
    } finally {
      await setBudgetCurrency("PLN");
    }
    // Back to PLN: exactly the first total; ledger rows byte-identical.
    expect(await foodTotal()).toBe(14500n);
    expect(await ledgerSnapshot()).toEqual(before);
  });
});
