/**
 * projected-monthly.test.ts — what a category will cost in an average month
 * from here (user, 260808).
 *
 * Three questions the household asked, in order:
 *
 *   1. Divide by the months in the RANGE — capped at the months the category
 *      has existed — not by the months that happen to carry a number. Giving
 *      twice in a year is 42 a month, not 251.
 *   2. A repeating payment must not be counted twice. Its charges are already
 *      sitting in the history whenever they have been paid, and the ledger only
 *      names them from the day the rule was recorded — which for a long-running
 *      alimony is a year too late.
 *   3. A one-off needs money set aside per month between now and the day it
 *      lands.
 */
import { describe, test, expect } from "bun:test";
import { projectedMonthly } from "../../src/domain/projected-monthly";

const zl = (n: number) => BigInt(Math.round(n * 100));
const months = (from: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const [y, m] = from.split("-").map(Number) as [number, number];
    const z = y * 12 + (m - 1) + i;
    return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
  });

const YEAR = months("2025-09", 12);

const run = (
  spent: Record<string, number>,
  rules: Parameters<typeof projectedMonthly>[0]["rules"] = [],
  windowMonths = YEAR,
) =>
  projectedMonthly({
    windowMonths,
    spentByMonth: new Map(
      Object.entries(spent).map(([m, v]) => [m, zl(v)] as const),
    ),
    rules,
    fromMonth: "2026-09",
  });

describe("the average is over the window, not over the months with numbers", () => {
  test("two gifts in a year read as a twelfth of them each month", () => {
    // Altruism, live: 286 in February and 216 in March, and nothing else all
    // year. It used to divide by the two months that had a figure and report
    // 251 a month (user, 260808).
    expect(run({ "2026-02": 286, "2026-03": 216 })).toBe(zl((286 + 216) / 12));
  });

  test("a category that has only existed three months divides by three", () => {
    // The window is what the caller passes: months in the range the category
    // has actually been alive for. A younger category is not diluted by months
    // that were never its own.
    expect(run({ "2026-02": 300 }, [], months("2026-01", 3))).toBe(zl(100));
  });

  test("no window at all is nothing, not a division by zero", () => {
    expect(run({}, [], [])).toBe(0n);
  });
});

describe("a repeating payment is counted once", () => {
  const monthly = (amount: number) =>
    [{ amount_cents: zl(amount), cadence: "MONTHLY" as const, yearly_month: null }];

  test("a rule the history already pays is not added again", () => {
    // Kids, live: 2,000 a month of alimony, a 2,000 monthly rule, and the
    // ledger links only the one month since the rule was recorded. The habit
    // already contains it, so the projection is what it costs — not twice that.
    const spent = Object.fromEntries(YEAR.map((m) => [m, 2000]));
    expect(run(spent, monthly(2000))).toBe(zl(2000));
  });

  test("a rule the history has never paid is added in full", () => {
    expect(run({}, monthly(3000))).toBe(zl(3000));
  });

  test("only the part the history cannot account for is added", () => {
    // 500 a month of habit and a 2,000 rule: 500 of the rule is already in
    // there, so 1,500 is new.
    const spent = Object.fromEntries(YEAR.map((m) => [m, 500]));
    expect(run(spent, monthly(2000))).toBe(zl(2000));
  });

  test("a yearly charge inside the window is not added on top of itself", () => {
    // THE GAP the monthly floor never covered: 12,000 every January is 1,000 a
    // month, and a year-long window already contains that January.
    const spent = { "2026-01": 12000 };
    expect(
      run(spent, [
        { amount_cents: zl(12000), cadence: "YEARLY", yearly_month: 1 },
      ]),
    ).toBe(zl(1000));
  });

  test("a yearly charge the window never saw IS added", () => {
    // A three-month window with no January in it knows nothing about it.
    expect(
      run(
        {},
        [{ amount_cents: zl(12000), cadence: "YEARLY", yearly_month: 1 }],
        months("2026-05", 3),
      ),
    ).toBe(zl(1000));
  });

  test("two rules cannot both claim the same spending", () => {
    // 600 of habit against a 400 and a 300 rule: the habit can only account
    // for 600 of the 700, so 100 is new.
    const spent = Object.fromEntries(YEAR.map((m) => [m, 600]));
    expect(
      run(spent, [
        { amount_cents: zl(400), cadence: "MONTHLY", yearly_month: null },
        { amount_cents: zl(300), cadence: "MONTHLY", yearly_month: null },
      ]),
    ).toBe(zl(700));
  });
});

describe("a one-off is saved for, month by month", () => {
  const once = (amount: number, date: string) => [
    {
      amount_cents: zl(amount),
      cadence: "ONCE" as const,
      yearly_month: null,
      next_due_date: date,
    },
  ];

  test("splits it over the months between now and the day it lands", () => {
    // 9,000 due in five months' time is 1,800 a month to have it ready.
    expect(run({}, once(9000, "2027-02-10"))).toBe(zl(1800));
  });

  test("the whole thing when it lands this month", () => {
    expect(run({}, once(9000, "2026-09-10"))).toBe(zl(9000));
  });

  test("nothing once the date has gone", () => {
    expect(run({}, once(9000, "2026-01-10"))).toBe(0n);
  });

  test("it is never absorbed by the history — it has not happened yet", () => {
    const spent = Object.fromEntries(YEAR.map((m) => [m, 5000]));
    expect(run(spent, once(9000, "2027-02-10"))).toBe(zl(5000 + 1800));
  });
});
