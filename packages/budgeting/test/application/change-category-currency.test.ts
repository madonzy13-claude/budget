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
    // Seeded, never borrowed from real history: a testcontainer has none.
    await b.rates([{ base: "USD", quote: "EUR", date: "1998-05-01", rate: "0.9" }]);
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
    const ok = async (currency: string) =>
      expect((await change({ tenantId: b.tenant, userId: b.user, categoryId: food, currency })).isOk()).toBe(true);
    await ok("EUR");
    await ok("USD");
    expect((await segments()).find((x) => x.f === "1998-05-01")?.n).toBe("26000");
    await ok("EUR");
    // The editor reads the source too, so its own preview round-trips exactly.
    const eff = await new DrizzleCategoryLimitRepo().effectiveForMonths(b.tenant, b.tenant, ["1998-05-01"]);
    expect(eff.get("1998-05-01")?.get(food)?.convertedFrom).toMatchObject({ currency: "USD", normal: "26000" });
  });

  test("a converted split still adds up to the limit (review WR-06)", async () => {
    const split = await b.category("PLN");
    await b.limit(split, 4, "PLN", "1998-05-01");
    await b.sql(`UPDATE budgeting.category_limits SET needs_amount = 2, wants_amount = 2 WHERE category_id = $1`, [split]);
    // At 0.2333: 4 → 1, but 2 → 0 and 2 → 0 if each part converted alone.
    expect((await change({ tenantId: b.tenant, userId: b.user, categoryId: split, currency: "EUR" })).isOk()).toBe(true);
    const r = (
      await b.sql(
        `SELECT normal_amount::text n, needs_amount::text nd, wants_amount::text w FROM budgeting.category_limits
          WHERE category_id = $1 AND effective_to IS NULL`,
        [split],
      )
    ).rows[0] as { n: string; nd: string; w: string };
    expect(BigInt(r.nd) + BigInt(r.w)).toBe(BigInt(r.n));
  });

  // Owner, 261104: changing the currency while viewing a PAST month changes
  // only that month; the months around it, and the category's current
  // currency, stay exactly as they were.
  test("a change in a past month converts only that month", async () => {
    const cat = await b.category("PLN");
    await b.limit(cat, 40000, "PLN", "1998-01-01");
    const r = await change({ tenantId: b.tenant, userId: b.user, categoryId: cat, currency: "EUR", month: "1998-03-01" });
    expect(r.isOk()).toBe(true);
    const segs = (
      await b.sql(
        `SELECT effective_from::text f, effective_to::text t, normal_amount::text n, normal_currency::text c
           FROM budgeting.category_limits WHERE category_id = $1 ORDER BY effective_from`,
        [cat],
      )
    ).rows;
    // 400 PLN at 0.2333 (earliest seeded PLN→EUR, before any rate in March) = 93.32 EUR.
    expect(segs).toEqual([
      { f: "1998-01-01", t: "1998-02-28", n: "40000", c: "PLN" },
      { f: "1998-03-01", t: "1998-03-31", n: "9332", c: "EUR" },
      { f: "1998-04-01", t: null, n: "40000", c: "PLN" },
    ]);
    const now = (await b.sql(`SELECT currency::text c FROM budgeting.categories WHERE id = $1`, [cat])).rows[0];
    expect(now).toEqual({ c: "PLN" });
    // …and back again restores the typed amount exactly.
    await change({ tenantId: b.tenant, userId: b.user, categoryId: cat, currency: "PLN", month: "1998-03-01" });
    const march = (
      await b.sql(
        `SELECT normal_amount::text n, normal_currency::text c FROM budgeting.category_limits
          WHERE category_id = $1 AND effective_from = '1998-03-01'`,
        [cat],
      )
    ).rows[0];
    expect(march).toEqual({ n: "40000", c: "PLN" });
  });

  // Owner, 261104 ("my category", September): a past month with NO limit yet
  // still takes the new currency — it gets its own zero segment, so the limit
  // the slider writes next is in that month's currency.
  test("a past month with no limit gets a segment in the new currency", async () => {
    const cat = await b.category("PLN");
    await b.limit(cat, 30000, "PLN", "1998-04-01");
    const r = await change({ tenantId: b.tenant, userId: b.user, categoryId: cat, currency: "EUR", month: "1998-02-01" });
    expect(r.isOk()).toBe(true);
    const segs = (
      await b.sql(
        `SELECT effective_from::text f, effective_to::text t, normal_amount::text n, normal_currency::text c
           FROM budgeting.category_limits WHERE category_id = $1 ORDER BY effective_from`,
        [cat],
      )
    ).rows;
    expect(segs).toEqual([
      { f: "1998-02-01", t: "1998-02-28", n: "0", c: "EUR" },
      { f: "1998-04-01", t: null, n: "30000", c: "PLN" },
    ]);
    // Its own currency already: nothing to record.
    await change({ tenantId: b.tenant, userId: b.user, categoryId: cat, currency: "PLN", month: "1998-03-01" });
    const after = (await b.sql(`SELECT count(*)::int n FROM budgeting.category_limits WHERE category_id = $1`, [cat])).rows[0];
    expect(after).toEqual({ n: 2 });
  });

  test("the reserve is rebuilt in the new currency (D-17)", async () => {
    const r = await b.positions();
    expect(r.categoryCurrency?.get(food)).toBe("EUR");
    // Each closed month's leftover → EUR at its closing rate (earliest seeded
    // 0.2333): February 1000 PLN (nothing spent) → 233.30, March 500 → 116.65,
    // April 1000 (nothing spent) → 233.30. A month with a limit and no spending
    // leaves all of it (owner, 261104) — 583.25 EUR.
    expect(r.positions.get(food)?.reserveCents).toBe(58325n);
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
