/**
 * budget-home-summary-multi-currency.test.ts — D-02 / D-08 on the budget home
 * cards. Fixture: multi-currency-fixture.ts.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createBudgetHomeSummaryRepo } from "../../src/adapters/persistence/budget-home-summary-repo";
import { createFixture, dropFixture, setBudgetCurrency, type Fixture } from "./multi-currency-fixture";

const PROVIDER = `test-14-08-home-${crypto.randomUUID()}`;
let f: Fixture;
const repo = createBudgetHomeSummaryRepo();
const M0 = new Date("1999-06-01T00:00:00Z");
const M1 = new Date("1999-07-01T00:00:00Z");

describe.skipIf(!process.env.DATABASE_URL_APP)("Budget home in mixed currencies", () => {
  beforeAll(async () => {
    f = await createFixture(PROVIDER);
  });
  afterAll(() => dropFixture(f, PROVIDER));

  test("this month's spend converts each transaction at its own date", async () => {
    expect(await repo.sumCurrentMonthSpend(f.tenant, M0, M1)).toBe(14000n);
  });

  test("overspend compares converted spend with the limit at today's rate", async () => {
    const top = await repo.topOverspentCategories(f.tenant, M0, M1, false, 5);
    // T: 10 EUR × 4.0 = 4000 PLN spent vs 2 EUR × 4.5 = 900 PLN limit.
    expect(top.find((r) => r.category_id === f.T)?.over_amount_cents).toBe(3100n);
  });

  test("after a switch to EUR the cards are in EUR; back to PLN restores them", async () => {
    await setBudgetCurrency(f, "EUR");
    try {
      expect(await repo.sumCurrentMonthSpend(f.tenant, M0, M1)).toBe(3500n);
      const top = await repo.topOverspentCategories(f.tenant, M0, M1, false, 5);
      expect(top.find((r) => r.category_id === f.T)?.over_amount_cents).toBe(800n);
    } finally {
      await setBudgetCurrency(f, "PLN");
    }
    expect(await repo.sumCurrentMonthSpend(f.tenant, M0, M1)).toBe(14000n);
  });
});
