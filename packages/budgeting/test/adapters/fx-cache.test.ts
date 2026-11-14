/**
 * fx-cache.test.ts — stored conversions into the budget's current currency
 * (quick 20261112-fx-cache). Reads use the stored amount when it is in the
 * currency asked for and convert live otherwise, so the store only ever holds
 * a figure that can no longer change: same currency, or the exact rate of the
 * row's own day, and that day before yesterday.
 *
 * Fixture: multi-currency-fixture.ts (PLN budget; EUR→PLN 05-20 4.0, 06-10 4.5,
 * 06-20 9.9; no rate on any other day). Real Postgres, infisical.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createWealthSnapshotRepo } from "../../src/adapters/persistence/wealth-snapshot-repo";
import { createOverviewRepo } from "../../src/adapters/persistence/overview-repo";
import { addTx, asApp, createFixture, dropFixture, setBudgetCurrency, type Fixture } from "./multi-currency-fixture";
import { seedFxRates, deleteFxRates } from "../fx-seed";
import { fillFxCaches } from "../../src/adapters/persistence/fx-cache-fill";

const PROVIDER = `test-fx-cache-${crypto.randomUUID()}`;
const LATE = `test-fx-cache-late-${crypto.randomUUID()}`;
let f: Fixture;

const stored = async (id: string) => {
  let row: { ccy: string | null; cents: string | null } = { ccy: null, cents: null };
  await asApp(f, async (db) => {
    const r = await db.query(
      `SELECT fx_cache_ccy::text AS ccy, fx_cache_cents::text AS cents FROM budgeting.expense_ledger WHERE id = $1`,
      [id],
    );
    row = r.rows[0];
  });
  return row;
};
const run = (q: string, p: unknown[]) => asApp(f, async (db) => void (await db.query(q, p)));

describe.skipIf(!process.env.DATABASE_URL_APP)("Stored conversions", () => {
  beforeAll(async () => {
    f = await createFixture(PROVIDER);
  });
  afterAll(async () => {
    await deleteFxRates(LATE);
    await dropFixture(f, PROVIDER);
  });

  test("a row stores its amount in the budget currency when its day has a rate", async () => {
    const eur = await addTx(f, f.A, "1999-06-10", 1000, "EUR");
    expect(await stored(eur)).toEqual({ ccy: "PLN", cents: "4500" });
    const pln = await addTx(f, f.A, "1999-06-02", 777, "PLN");
    expect(await stored(pln)).toEqual({ ccy: "PLN", cents: "777" });
  });

  test("no rate on its own day, no pair, or too recent: nothing stored", async () => {
    expect(await stored(await addTx(f, f.A, "1999-06-05", 1000, "EUR"))).toEqual({ ccy: null, cents: null });
    expect(await stored(await addTx(f, f.A, "1999-06-10", 1000, "ZZQ"))).toEqual({ ccy: null, cents: null });
    const today = new Date().toISOString().slice(0, 10);
    expect(await stored(await addTx(f, f.A, today, 1000, "EUR"))).toEqual({ ccy: null, cents: null });
  });

  test("an edit stores it again", async () => {
    const id = await addTx(f, f.A, "1999-06-10", 1000, "EUR");
    await run(`UPDATE budgeting.expense_ledger SET amount_original_cents = 2000 WHERE id = $1`, [id]);
    expect(await stored(id)).toEqual({ ccy: "PLN", cents: "9000" });
    await run(`UPDATE budgeting.expense_ledger SET transaction_date = '1999-05-20' WHERE id = $1`, [id]);
    expect(await stored(id)).toEqual({ ccy: "PLN", cents: "8000" });
    await run(`UPDATE budgeting.expense_ledger SET currency_original = 'PLN' WHERE id = $1`, [id]);
    expect(await stored(id)).toEqual({ ccy: "PLN", cents: "2000" });
  });

  test("a budget currency change stores every row again in the new currency", async () => {
    const eur = await addTx(f, f.A, "1999-06-10", 1000, "EUR");
    const pln = await addTx(f, f.A, "1999-06-10", 1000, "PLN");
    await setBudgetCurrency(f, "EUR");
    try {
      expect(await stored(eur)).toEqual({ ccy: "EUR", cents: "1000" });
      expect(await stored(pln)).toEqual({ ccy: "EUR", cents: "200" });
    } finally {
      await setBudgetCurrency(f, "PLN");
    }
    expect(await stored(eur)).toEqual({ ccy: "PLN", cents: "4500" });
  });

  test("a rate that arrives later is filled in", async () => {
    const id = await addTx(f, f.A, "1999-06-07", 1000, "EUR");
    expect((await stored(id)).ccy).toBeNull();
    await seedFxRates([{ base: "EUR", quote: "PLN", date: "1999-06-07", rate: "4.2" }], LATE);
    await run(`SELECT budgeting.fx_cache_fill($1::uuid)`, [f.tenant]);
    expect(await stored(id)).toEqual({ ccy: "PLN", cents: "4200" });
  });

  test("the hourly fill reaches every budget", async () => {
    const id = await addTx(f, f.A, "1999-06-08", 1000, "EUR");
    await seedFxRates([{ base: "EUR", quote: "PLN", date: "1999-06-08", rate: "4.3" }], LATE);
    await fillFxCaches();
    expect(await stored(id)).toEqual({ ccy: "PLN", cents: "4300" });
  });

  test("wealth snapshots store all three amounts and follow a currency change", async () => {
    let id = "";
    await asApp(f, async (db) => {
      const r = await db.query(
        `INSERT INTO budgeting.budget_wealth_snapshots
           (tenant_id, budget_id, captured_at, capitalization_cents, investment_value_cents,
            investment_cost_basis_cents, currency)
         VALUES ($1, $1, '1999-06-10T12:00:00Z', 25000, 20000, 10000, 'EUR') RETURNING id`,
        [f.tenant],
      );
      id = r.rows[0].id;
    });
    const snap = async () => {
      let row: Record<string, string | null> = {};
      await asApp(f, async (db) => {
        row = (
          await db.query(
            `SELECT fx_cache_ccy::text AS ccy, fx_cache_capitalization_cents::text AS cap,
                    fx_cache_investment_value_cents::text AS inv, fx_cache_investment_cost_basis_cents::text AS cost
               FROM budgeting.budget_wealth_snapshots WHERE id = $1`,
            [id],
          )
        ).rows[0];
      });
      return row;
    };
    expect(await snap()).toEqual({ ccy: "PLN", cap: "112500", inv: "90000", cost: "45000" });
    await setBudgetCurrency(f, "EUR");
    try {
      expect(await snap()).toEqual({ ccy: "EUR", cap: "25000", inv: "20000", cost: "10000" });
    } finally {
      await setBudgetCurrency(f, "PLN");
    }
  });

  test("reads use the stored amount — they still answer once the rate is gone", async () => {
    const wealth = createWealthSnapshotRepo();
    const before = await wealth.seriesForRange(f.tenant, "1999-06-07", "1999-06-07");
    await asApp(f, async (db) => {
      await db.query(
        `INSERT INTO budgeting.budget_wealth_snapshots
           (tenant_id, budget_id, captured_at, capitalization_cents, investment_value_cents, currency)
         VALUES ($1, $1, '1999-06-07T12:00:00Z', 1000, 1000, 'EUR')`,
        [f.tenant],
      );
    });
    expect(before).toEqual([]);
    await addTx(f, f.B, "1999-06-07", 1000, "EUR");
    await deleteFxRates(LATE);
    // Live, 06-07 would fall back to 05-20's 4.0.
    const spend = await createOverviewRepo().monthlySpendByCategory(f.tenant, "1999-06-01", "1999-06-30");
    expect(spend.find((r) => r.category_id === f.B)?.spent_cents).toBe(4200n);
    const after = await wealth.seriesForRange(f.tenant, "1999-06-07", "1999-06-07");
    expect(after.map((r) => r.capitalization_cents)).toEqual([4200n]);
  });
});
