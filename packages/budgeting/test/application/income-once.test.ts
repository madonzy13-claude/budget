/**
 * income-once.test.ts — an income that arrives exactly once (260807).
 *
 * Every "monthly income" figure in the app runs through
 * normalizeIncomesToMonthlyItems: the SMART investment limit, the
 * income-under-planned task, the Overview's income figures. A bonus entered as
 * a monthly income inflated all of them until the household deleted it — which
 * is precisely why the one-time option exists, so it must not inflate them
 * either.
 */
import { describe, test, expect } from "bun:test";
import { normalizeIncomesToMonthlyItems } from "../../src/application/investment-smart-limit";

const salary = {
  amount: "5000.0000",
  currency: "PLN",
  cadence: "MONTHLY" as const,
};
const bonus = {
  amount: "9000.0000",
  currency: "PLN",
  cadence: "ONCE" as const,
  once_date: "2026-11-20",
};

describe("normalizeIncomesToMonthlyItems — a one-time income", () => {
  test("counts in full in the month it arrives", () => {
    const items = normalizeIncomesToMonthlyItems([bonus], "2026-11");
    expect(items).toEqual([{ amount_cents: 900000n, currency: "PLN" }]);
  });

  test("counts for nothing in any other month", () => {
    // Not a twelfth, not an average: it is simply not income that month.
    expect(
      normalizeIncomesToMonthlyItems([bonus], "2026-10")[0]!.amount_cents,
    ).toBe(0n);
    expect(
      normalizeIncomesToMonthlyItems([bonus], "2026-12")[0]!.amount_cents,
    ).toBe(0n);
  });

  test("leaves the rhythms exactly as they were", () => {
    expect(normalizeIncomesToMonthlyItems([salary], "2026-10")).toEqual([
      { amount_cents: 500000n, currency: "PLN" },
    ]);
  });

  test("adds to the month's other income rather than replacing it", () => {
    const items = normalizeIncomesToMonthlyItems([salary, bonus], "2026-11");
    expect(items.reduce((s, i) => s + i.amount_cents, 0n)).toBe(1400000n);
  });

  test("without a month to judge against, a one-time income counts for nothing", () => {
    // A caller that cannot say WHEN it is asking about must not be handed a
    // figure that is only true in one month of the year.
    expect(normalizeIncomesToMonthlyItems([bonus])[0]!.amount_cents).toBe(0n);
  });

  test("a one-time income with no date counts for nothing", () => {
    expect(
      normalizeIncomesToMonthlyItems(
        [{ ...bonus, once_date: undefined }],
        "2026-11",
      )[0]!.amount_cents,
    ).toBe(0n);
  });
});

import { upcomingIncomeItems } from "../../src/application/recompute-income-under-planned-task";
import { Temporal } from "temporal-polyfill";

describe("upcomingIncomeItems — a one-time income", () => {
  const row = {
    amount_cents: "900000",
    currency: "PLN",
    cadence: "ONCE" as const,
    cadence_anchor: null,
    yearly_month: null,
    once_date: "2026-11-20",
  };
  const on = (iso: string) => Temporal.PlainDate.from(iso);

  test("is money still coming when its day is ahead of today", () => {
    expect(upcomingIncomeItems([row], on("2026-11-05"))).toEqual([
      { amount_cents: 900000n, currency: "PLN" },
    ]);
  });

  test("has arrived once its day has passed — a wallet holds it now", () => {
    // Same rule the monthly pay-day follows: counting it here as well would
    // double it.
    expect(upcomingIncomeItems([row], on("2026-11-25"))).toEqual([]);
  });

  test("is nothing to this month when it lands in another", () => {
    expect(upcomingIncomeItems([row], on("2026-10-05"))).toEqual([]);
    expect(upcomingIncomeItems([row], on("2026-12-05"))).toEqual([]);
  });

  test("with no date it is not counted at all", () => {
    expect(
      upcomingIncomeItems([{ ...row, once_date: null }], on("2026-11-05")),
    ).toEqual([]);
  });
});
