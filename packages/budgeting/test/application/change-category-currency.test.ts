/**
 * change-category-currency.test.ts — D-07: a category's currency can change
 * after it has transactions. Its limit converts at today's rate for the
 * current and future SCD-2 segments; past segments keep their old currency
 * (the D-17 replay reads them as they were); transactions never move.
 *
 * Today (test clock) = 1998-05-15; PLN→EUR 0.2333 on 1998-05-01.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ReserveBudget } from "../reserves/currency-fixture";
import { changeCategoryCurrency } from "../../src/application/change-category-currency";
import { DrizzleCategoryLimitRepo } from "../../src/adapters/persistence/category-limit-repo";
import { createTransaction } from "../../src/application/create-transaction";
import { DrizzleTransactionRepo } from "../../src/adapters/persistence/transaction-repo";

const b = new ReserveBudget();
let food: string;
const change = changeCategoryCurrency({ limitRepo: new DrizzleCategoryLimitRepo() });
const segments = async () =>
  (
    await b.sql(
      `SELECT effective_from::text f, effective_to::text t, normal_amount::text n, cushion_amount::text c,
              normal_currency::text nc, cushion_currency::text cc
         FROM budgeting.category_limits WHERE category_id = $1 ORDER BY effective_from`,
      [food],
    )
  ).rows;
const ledger = async () =>
  (await b.sql(`SELECT row_to_json(l)::text j FROM budgeting.expense_ledger l WHERE tenant_id = $1 ORDER BY id`, [b.tenant]))
    .rows.map((r) => r.j);

describe.skipIf(!process.env.DATABASE_URL_APP)("Change a category's currency", () => {
  beforeAll(async () => {
    await b.create("PLN");
    await b.rates([{ base: "PLN", quote: "EUR", date: "1998-05-01", rate: "0.2333" }]);
    food = await b.category("PLN");
    await b.limit(food, 100000, "PLN", "1998-02-01", "1998-05-31");
    await b.limit(food, 120000, "PLN", "1998-06-01");
    await b.tx(food, "1998-03-10", 50000, "PLN");
    await b.tx(food, "1998-05-03", 1000, "PLN");
  });
  afterAll(() => b.drop());

  test("the same currency is a no-op", async () => {
    const r = await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency: "PLN" });
    expect(r._unsafeUnwrap().limitsConverted).toBe(0);
    expect((await segments()).length).toBe(2);
  });

  test("a pair with no rate is refused and nothing changes", async () => {
    const r = await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency: "ZZQ" });
    expect(r.isErr() && r.error.message).toBe("fx_rate_unavailable");
    expect((await b.sql(`SELECT currency::text c FROM budgeting.categories WHERE id = $1`, [food])).rows[0].c).toBe("PLN");
    expect((await segments()).map((s) => s.nc)).toEqual(["PLN", "PLN"]);
  });

  test("current and future limits convert at today's rate; the past and the ledger stay", async () => {
    const before = await ledger();
    const r = await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency: "EUR" });
    expect(r._unsafeUnwrap()).toMatchObject({ category: { currency: "EUR" }, limitsConverted: 2 });
    expect(await segments()).toEqual([
      { f: "1998-02-01", t: "1998-04-30", n: "100000", c: "100000", nc: "PLN", cc: "PLN" },
      { f: "1998-05-01", t: "1998-05-31", n: "23330", c: "23330", nc: "EUR", cc: "EUR" },
      { f: "1998-06-01", t: null, n: "27996", c: "27996", nc: "EUR", cc: "EUR" },
    ]);
    expect(await ledger()).toEqual(before);
  });

  test("changing back restores the limits exactly, and another switch starts from them (user, 261103)", async () => {
    // Make the reverse rate deliberately inconsistent: 100000 × 0.2333 = 23330,
    // and 23330 × 4.2863 = 99999.88 — a conversion of a conversion drifts.
    await b.rates([{ base: "EUR", quote: "PLN", date: "1998-05-01", rate: "4.2863" }]);
    await b.rates([{ base: "PLN", quote: "USD", date: "1998-05-01", rate: "0.25" }]);
    expect((await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency: "PLN" })).isOk()).toBe(true);
    expect((await segments()).slice(1).map((x) => [x.n, x.nc])).toEqual([
      ["100000", "PLN"],
      ["120000", "PLN"],
    ]);
    // EUR again, then USD: USD comes from the PLN amounts, not from EUR.
    await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency: "EUR" });
    await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency: "USD" });
    expect((await segments()).slice(1).map((x) => [x.n, x.nc])).toEqual([
      ["25000", "USD"],
      ["30000", "USD"],
    ]);
    // A limit typed by the user is the new basis.
    await new DrizzleCategoryLimitRepo().setLimitForMonth({
      tenantId: b.tenant, categoryId: food, monthStart: "1998-05-01", normalAmount: "26000",
      normalCurrency: "USD", cushionAmount: "26000", cushionCurrency: "USD", actorUserId: b.user,
      carryForward: false,
    });
    await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency: "EUR" });
    await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency: "USD" });
    expect((await segments()).find((x) => x.f === "1998-05-01")?.n).toBe("26000");
    await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency: "EUR" });
  });

  test("the reserve is rebuilt in the new currency (D-17)", async () => {
    const r = await b.positions();
    expect(r.categoryCurrency?.get(food)).toBe("EUR");
    // March: 500 PLN left over → EUR at the closing rate (earliest seeded 0.2333) = 116.65.
    expect(r.positions.get(food)?.reserveCents).toBe(11665n);
  });

  test("a new transaction without a currency is in the new one (D-05)", async () => {
    const r = await createTransaction({
      transactionRepo: new DrizzleTransactionRepo(),
      fxProvider: { rateAsOf: async () => ({ rate: "4.3", provider: "t", isStale: false }) },
      getBudgetCurrency: async () => "PLN",
    })({ date: "1998-05-10", categoryId: food, amountOriginalCents: 500, budgetId: b.tenant, tenantId: b.tenant, actorUserId: b.user });
    expect(r._unsafeUnwrap().transaction.currencyOriginal).toBe("EUR");
  });
});
