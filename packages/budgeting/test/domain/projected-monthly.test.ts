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
import {
  earmarkedForOneOffs,
  projectedMonthly,
} from "../../src/domain/projected-monthly";

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
  const monthly = (amount: number) => [
    {
      amount_cents: zl(amount),
      cadence: "MONTHLY" as const,
      yearly_month: null,
    },
  ];

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

/**
 * Money already set aside is not money you must save again (user, 260809).
 *
 * Travel, live: 17,315 sitting in the reserve for a 17,000 trip, and the
 * suggested limit still spread that trip over the twelve months to it. Setting
 * that limit funds the trip a SECOND time, out of income — at which point the
 * reserve has no job left, the chart called all 17,315 spare, and the household
 * was invited to empty a buffer it would have to rebuild from zero.
 *
 * So a one-off asks only for what its category's reserve does not already hold.
 * Yearly bills keep their whole share: they come round again every year, and no
 * reserve pre-funds them for ever.
 */
describe("a one-off already saved for asks for nothing more", () => {
  const once = (amount: number, date: string) => ({
    amount_cents: zl(amount),
    cadence: "ONCE" as const,
    yearly_month: null,
    next_due_date: date,
  });
  const withHeld = (
    held: number,
    rules: Parameters<typeof projectedMonthly>[0]["rules"],
  ) =>
    projectedMonthly({
      windowMonths: YEAR,
      spentByMonth: new Map(),
      rules,
      fromMonth: "2026-09",
      reserveHeldCents: zl(held),
    });

  test("a reserve that covers the whole trip removes its monthly share", () => {
    expect(withHeld(9000, [once(9000, "2027-02-10")])).toBe(0n);
  });

  test("more held than the trip costs is not a credit against anything else", () => {
    const spent = Object.fromEntries(YEAR.map((m) => [m, 200]));
    expect(
      projectedMonthly({
        windowMonths: YEAR,
        spentByMonth: new Map(
          Object.entries(spent).map(([m, v]) => [m, zl(v)] as const),
        ),
        rules: [once(9000, "2027-02-10")],
        fromMonth: "2026-09",
        reserveHeldCents: zl(20000),
      }),
    ).toBe(zl(200));
  });

  test("a partial reserve leaves only the shortfall to save", () => {
    // 9,000 due in five months with 4,000 already held → 1,000 a month.
    expect(withHeld(4000, [once(9000, "2027-02-10")])).toBe(zl(1000));
  });

  test("the reserve goes to the SOONEST trip first", () => {
    // 5,000 held against a 5,000 trip two months out and a 6,000 one six
    // months out: the near one is covered, the far one still needs 1,000/mo.
    expect(
      withHeld(5000, [once(6000, "2027-03-10"), once(5000, "2026-11-10")]),
    ).toBe(zl(1000));
  });

  test("it does NOT excuse a yearly bill, which comes round again", () => {
    expect(
      withHeld(50000, [
        { amount_cents: zl(12000), cadence: "YEARLY", yearly_month: 1 },
      ]),
    ).toBe(zl(1000));
  });

  test("a reserve with no one-off to cover changes nothing", () => {
    expect(
      withHeld(50000, [
        { amount_cents: zl(400), cadence: "MONTHLY", yearly_month: null },
      ]),
    ).toBe(zl(400));
  });

  test("a date already gone consumes none of the reserve", () => {
    // The passed trip asks for nothing, so the whole reserve is still there
    // for the one that has not happened yet.
    expect(
      withHeld(9000, [once(4000, "2026-01-10"), once(9000, "2027-02-10")]),
    ).toBe(0n);
  });
});

/**
 * The other half of the same credit (user, 260809).
 *
 * If the limit is no longer asked to save for a trip the reserve is holding the
 * money for, then that reserve must KEEP holding it — otherwise the chart says
 * "needed 0" (the limit's accrual could fund the trip on its own) beside advice
 * that assumes the reserve will. Whatever the projection credits, the reserve
 * requirement floors.
 */
describe("what the reserve is earmarked for", () => {
  const once = (amount: number, date: string) => ({
    amount_cents: zl(amount),
    cadence: "ONCE" as const,
    yearly_month: null,
    next_due_date: date,
  });
  const at = (held: number, rules: Parameters<typeof earmarkedForOneOffs>[0]) =>
    earmarkedForOneOffs(rules, "2026-09", zl(held));

  test("is the whole trip when the reserve covers it", () => {
    expect(at(17315, [once(17000, "2027-08-01")])).toBe(zl(17000));
  });

  test("is only what is held when the reserve falls short", () => {
    expect(at(4000, [once(9000, "2027-02-10")])).toBe(zl(4000));
  });

  test("stops at the trips — the rest of the reserve is free", () => {
    expect(at(20000, [once(9000, "2027-02-10")])).toBe(zl(9000));
  });

  test("spends the reserve on the SOONEST trip first", () => {
    expect(at(5000, [once(6000, "2027-03-10"), once(5000, "2026-11-10")])).toBe(
      zl(5000),
    );
  });

  test("earmarks nothing for a date already gone", () => {
    expect(at(9000, [once(4000, "2026-01-10")])).toBe(0n);
  });

  test("earmarks nothing against a yearly bill", () => {
    expect(
      at(50000, [
        { amount_cents: zl(12000), cadence: "YEARLY", yearly_month: 1 },
      ]),
    ).toBe(0n);
  });

  test("is nothing when the reserve is empty", () => {
    expect(at(0, [once(9000, "2027-02-10")])).toBe(0n);
  });
});
