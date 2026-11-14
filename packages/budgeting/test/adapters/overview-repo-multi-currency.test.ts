/**
 * overview-repo-multi-currency.test.ts — D-02 / D-08 in the Overview read model.
 * Spend converts at each transaction's date; limits from their own currency at
 * LEAST(month end, today). Fixture: multi-currency-fixture.ts.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createOverviewRepo } from "../../src/adapters/persistence/overview-repo";
import { createFixture, dropFixture, setBudgetCurrency, type Fixture } from "./multi-currency-fixture";

const PROVIDER = `test-14-08-ov-${crypto.randomUUID()}`;
let f: Fixture;
const repo = createOverviewRepo();

const planned = async (month: string) =>
  (await repo.monthlyPlannedByCategory(f.tenant, "1999-05-01", "1999-06-30"))
    .filter((r) => r.month === month && (r.category_id === f.A || r.category_id === f.B))
    .reduce((s, r) => s + r.planned_cents, 0n);
const spent = async () =>
  (await repo.monthlySpendByCategory(f.tenant, "1999-06-01", "1999-06-30")).reduce(
    (s, r) => s + r.spent_cents,
    0n,
  );

describe.skipIf(!process.env.DATABASE_URL_APP)("Overview in mixed currencies", () => {
  beforeAll(async () => {
    f = await createFixture(PROVIDER);
  });
  afterAll(() => dropFixture(f, PROVIDER));

  test("a past month's foreign limit counts at the last rate within it", async () => {
    expect(await planned("1999-05")).toBe(100000n + 80000n); // 200 EUR × 4.0
  });

  test("the current month's foreign limit counts at the latest rate up to today", async () => {
    expect(await planned("1999-06")).toBe(100000n + 90000n); // × 4.5, not the later 9.9
  });

  test("spend converts each transaction at its own date", async () => {
    expect(await spent()).toBe(10000n + 4000n); // 10 EUR × 4.0 (05-20 ≤ 06-05)
    const daily = await repo.dailySpend(f.tenant, "1999-06-01", "1999-06-30");
    expect(daily.reduce((s, d) => s + d.spent_cents, 0n)).toBe(14000n);
  });

  test("after a switch to EUR everything is in EUR, and switching back restores PLN exactly", async () => {
    await setBudgetCurrency(f, "EUR");
    try {
      expect(await spent()).toBe(2500n + 1000n); // 100 PLN × 0.25 + 10 EUR
      expect(await planned("1999-06")).toBe(20000n + 20000n); // 1000 PLN × 0.2 + 200 EUR
    } finally {
      await setBudgetCurrency(f, "PLN");
    }
    expect(await spent()).toBe(14000n);
    expect(await planned("1999-06")).toBe(190000n);
  });
});
