/**
 * reserve-fit-wealth-multi-currency.test.ts — the last read paths (D-02):
 * reserve-fit ranks and sums converted amounts; wealth snapshots, stored in the
 * currency of their capture, re-express in the budget's current currency at
 * their own date (never rewritten). Fixture: multi-currency-fixture.ts.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createReserveFitRepo } from "../../src/adapters/persistence/reserve-fit-repo";
import { createWealthSnapshotRepo } from "../../src/adapters/persistence/wealth-snapshot-repo";
import { addTx, asApp, createFixture, dropFixture, setBudgetCurrency, type Fixture } from "./multi-currency-fixture";

const PROVIDER = `test-14-10-${crypto.randomUUID()}`;
let f: Fixture;
let eurTx: string;
const fit = createReserveFitRepo();
const wealth = createWealthSnapshotRepo();
const RANGE = { from: "1999-06-01", to: "1999-06-30" };

describe.skipIf(!process.env.DATABASE_URL_APP)("Reserve fit and wealth in mixed currencies", () => {
  beforeAll(async () => {
    f = await createFixture(PROVIDER);
    // A: 100.00 PLN on 06-02 (fixture) + 30.00 EUR on 06-05 ≈ 120.00 PLN — the
    // EUR row is the bigger one only once converted.
    eurTx = await addTx(f, f.A, "1999-06-05", 3000, "EUR");
    await asApp(f, async (db) => {
      for (const [at, cents, ccy] of [
        ["1999-05-20", 100000, "PLN"],
        ["1999-06-10", 25000, "EUR"],
        // No pair to PLN at all — must be left out, not plotted as a 0.
        ["1999-06-20", 99999, "ZZQ"],
      ] as const) {
        await db.query(
          `INSERT INTO budgeting.budget_wealth_snapshots
             (tenant_id, budget_id, captured_at, capitalization_cents, investment_value_cents,
              investment_cost_basis_cents, currency)
           VALUES ($1, $1, $2::timestamptz, $3, $3, NULL, $4)`,
          [f.tenant, `${at}T12:00:00Z`, cents, ccy],
        );
      }
    });
  });
  afterAll(() => dropFixture(f, PROVIDER));

  test("reserve-fit ranks by the converted amount", async () => {
    const large = (await fit.largeTransactions({ budgetId: f.tenant, ...RANGE })).filter(
      (r) => r.category_id === f.A,
    );
    expect(large.map((r) => [r.ledger_id === eurTx, r.amount_cents])).toEqual([
      [true, 12000n],
      [false, 10000n],
    ]);
    const page = await fit.oneOffPage({ budgetId: f.tenant, ...RANGE, categoryId: f.A, limit: 10 });
    expect(page.items.map((r) => r.amount_cents)).toEqual([12000n, 10000n]);
  });

  test("set-aside spend sums converted amounts", async () => {
    await fit.setExclusions({ budgetId: f.tenant, add: [eurTx], remove: [], actorUserId: f.user });
    const rows = await fit.excludedSpendByCategory({ budgetId: f.tenant, ...RANGE });
    expect(rows.find((r) => r.category_id === f.A)?.cents).toBe(12000n);
  });

  test("wealth snapshots re-express in the current currency at their own date", async () => {
    const pln = await wealth.seriesForRange(f.tenant, "1999-05-01", "1999-06-30");
    // 250 EUR × 4.5 (06-10); the ZZQ snapshot has no pair and drops out
    // rather than reading as a crash to 0 (review WR-04).
    expect(pln.map((r) => r.capitalization_cents)).toEqual([100000n, 112500n]);
    expect(pln[1]!.investment_cost_basis_cents).toBeNull();
    await setBudgetCurrency(f, "EUR");
    try {
      const eur = await wealth.seriesForRange(f.tenant, "1999-05-01", "1999-06-30");
      expect(eur.map((r) => r.capitalization_cents)).toEqual([25000n, 25000n]);
      expect((await wealth.openingBefore(f.tenant, "1999-06-30"))?.capitalization_cents).toBe(25000n);
      expect((await wealth.openingBefore(f.tenant, "1999-06-01"))?.capitalization_cents).toBe(25000n);
    } finally {
      await setBudgetCurrency(f, "PLN");
    }
  });
});
