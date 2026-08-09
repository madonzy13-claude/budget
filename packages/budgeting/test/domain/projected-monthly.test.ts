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

describe("a repeating payment is counted once — from the ledger, not a guess", () => {
  // The spend handed in is ORDINARY: what is linked to a rule has already been
  // taken out of it, because the ledger says which rows those are. So every
  // rule is simply added, once. Nothing is inferred from the size of anything
  // (user, 260809 — "the code shouldn't assume anything").
  const monthly = (amount: number) =>
    [{ amount_cents: zl(amount), cadence: "MONTHLY" as const, yearly_month: null }];

  test("adds the rule on top of what habit costs", () => {
    // 215 of habit left after the alimony was taken out, plus the 2,000 rule.
    const spent = Object.fromEntries(YEAR.map((m) => [m, 215]));
    expect(run(spent, monthly(2000))).toBe(zl(2215));
  });

  test("a rule in a category with no other spending is just the rule", () => {
    expect(run({}, monthly(3000))).toBe(zl(3000));
  });

  test("a NEW rule is added even where the category already spends more", () => {
    // The case the old guess got wrong: 800 of habit and a new 500 rule is
    // 1,300, not 800. Nothing links that rule to the past because it has no
    // past — and now nothing pretends otherwise.
    const spent = Object.fromEntries(YEAR.map((m) => [m, 800]));
    expect(run(spent, monthly(500))).toBe(zl(1300));
  });

  test("a yearly charge is its monthly share, wherever the window falls", () => {
    // 12,000 every January is 1,000 a month. The January it landed in is
    // already out of the habit above, so this is not a second helping.
    expect(
      run({}, [
        { amount_cents: zl(12000), cadence: "YEARLY", yearly_month: 1 },
      ]),
    ).toBe(zl(1000));
  });

  test("two rules each count for themselves", () => {
    const spent = Object.fromEntries(YEAR.map((m) => [m, 600]));
    expect(
      run(spent, [
        { amount_cents: zl(400), cadence: "MONTHLY", yearly_month: null },
        { amount_cents: zl(300), cadence: "MONTHLY", yearly_month: null },
      ]),
    ).toBe(zl(1300));
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

  test("it rides on top of the habit, like every other commitment", () => {
    const spent = Object.fromEntries(YEAR.map((m) => [m, 5000]));
    expect(run(spent, once(9000, "2027-02-10"))).toBe(zl(5000 + 1800));
  });
});
