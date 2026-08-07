/**
 * income-under-planned.test.ts — pure decision + upcoming-income projection for the
 * INCOME_UNDER_PLANNED task.
 *
 * 260731 (user decision): the rule now reads the CASH-FLOW PROJECTION — exactly the
 * math behind the Overview "Surplus / Deficit" figure — instead of comparing a
 * static Σ planned against Σ available. It fires when the projection says you go
 * under before your next income (or on any red day in the window).
 */
import { describe, test, expect } from "bun:test";
import { Temporal } from "temporal-polyfill";
import {
  decideProjectedShortfall,
  upcomingIncomeItems,
} from "@budget/budgeting/src/application/recompute-income-under-planned-task";

describe("Projected-shortfall decision (same source as the Surplus card)", () => {
  test("cash dips below zero before the next income → emit with that shortfall", () => {
    const d = decideProjectedShortfall({
      surplusDeficitCents: -20000n,
      good: true,
      worstShortfallCents: 0n,
    });
    expect(d.emit).toBe(true);
    expect(d.shortfallCents).toBe(20000n);
  });

  test("surplus before the next income and no red day → no emit", () => {
    const d = decideProjectedShortfall({
      surplusDeficitCents: 45000n,
      good: true,
      worstShortfallCents: 0n,
    });
    expect(d.emit).toBe(false);
    expect(d.shortfallCents).toBe(0n);
  });

  test("exactly zero before the next income → no emit (not short yet)", () => {
    const d = decideProjectedShortfall({
      surplusDeficitCents: 0n,
      good: true,
      worstShortfallCents: 0n,
    });
    expect(d.emit).toBe(false);
  });

  test("a SURPLUS never nags, even if a later day in the window dips", () => {
    const d = decideProjectedShortfall({
      surplusDeficitCents: 45000n,
      good: false,
      worstShortfallCents: 70000n,
    });
    expect(d.emit).toBe(false);
    expect(d.shortfallCents).toBe(0n);
  });

  test("reports the DEEPEST shortfall when both signals fire", () => {
    const d = decideProjectedShortfall({
      surplusDeficitCents: -20000n,
      good: false,
      worstShortfallCents: 90000n,
    });
    expect(d.shortfallCents).toBe(90000n);
  });

  test("no upcoming income: emits only when the projection actually goes red", () => {
    expect(
      decideProjectedShortfall({
        surplusDeficitCents: null,
        good: null,
        worstShortfallCents: 0n,
      }).emit,
    ).toBe(false);
    const short = decideProjectedShortfall({
      surplusDeficitCents: null,
      good: null,
      worstShortfallCents: 15000n,
    });
    expect(short.emit).toBe(true);
    expect(short.shortfallCents).toBe(15000n);
  });
});

describe("Upcoming income projection", () => {
  // 15th of a 31-day month.
  const day15 = Temporal.PlainDate.from("2026-07-15");

  test("MONTHLY pay-day still ahead → counted", () => {
    const items = upcomingIncomeItems(
      [
        {
          amount_cents: "300000",
          currency: "USD",
          cadence: "MONTHLY",
          cadence_anchor: 25, // 25th > 15th today → upcoming
          yearly_month: null,
        },
      ],
      day15,
    );
    expect(items).toEqual([{ amount_cents: 300000n, currency: "USD" }]);
  });

  test("MONTHLY pay-day already passed → dropped (money already in a wallet)", () => {
    const items = upcomingIncomeItems(
      [
        {
          amount_cents: "300000",
          currency: "USD",
          cadence: "MONTHLY",
          cadence_anchor: 5, // 5th < 15th today → passed
          yearly_month: null,
        },
      ],
      day15,
    );
    expect(items).toEqual([]);
  });

  test("YEARLY counts only in its month, when still ahead", () => {
    const base = {
      amount_cents: "1200000",
      currency: "USD",
      cadence: "YEARLY" as const,
      cadence_anchor: 25,
    };
    // July income, 25th ahead of the 15th → counted.
    expect(upcomingIncomeItems([{ ...base, yearly_month: 7 }], day15)).toEqual([
      { amount_cents: 1200000n, currency: "USD" },
    ]);
    // December income → not this month → dropped.
    expect(upcomingIncomeItems([{ ...base, yearly_month: 12 }], day15)).toEqual(
      [],
    );
  });

  test("DAILY/WEEKLY have no pay-day → continuously upcoming (monthly-normalized)", () => {
    const items = upcomingIncomeItems(
      [
        {
          amount_cents: "1000",
          currency: "USD",
          cadence: "DAILY",
          cadence_anchor: null,
          yearly_month: null,
        },
      ],
      day15,
    );
    // 1000 × 30.44 ≈ 30440 (round-half-up per recurringMonthlyNormalize).
    expect(items.length).toBe(1);
    expect(items[0]!.amount_cents).toBe(30440n);
    expect(items[0]!.currency).toBe("USD");
  });
});
