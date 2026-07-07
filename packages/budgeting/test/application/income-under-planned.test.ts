/**
 * income-under-planned.test.ts — pure decision + upcoming-income projection for the
 * INCOME_UNDER_PLANNED task (r33 → r36). Fires when AVAILABLE money (upcoming income
 * + spendings [+ cushion in cushion mode] wallets) is strictly below total planned.
 * NO income gate. RESERVE wallets are not counted. Wallet assembly is DB-backed
 * (computeIncomeVsPlanned); here we assert the pure threshold + the upcoming-income
 * date rule.
 */
import { describe, test, expect } from "bun:test";
import { Temporal } from "temporal-polyfill";
import {
  decideIncomeUnderPlanned,
  upcomingIncomeItems,
} from "@budget/budgeting/src/application/recompute-income-under-planned-task";

describe("Income under planned decision", () => {
  test("available < planned → emit with shortfall = planned − available", () => {
    const d = decideIncomeUnderPlanned({
      availableCents: 300000n,
      plannedCents: 500000n,
    });
    expect(d.emit).toBe(true);
    expect(d.shortfallCents).toBe(200000n);
  });

  test("no income configured, wallets alone fall short → still emit (no gate)", () => {
    const d = decideIncomeUnderPlanned({
      availableCents: 5000n, // only wallet money, no income
      plannedCents: 500000n,
    });
    expect(d.emit).toBe(true);
    expect(d.shortfallCents).toBe(495000n);
  });

  test("available == planned → no emit", () => {
    const d = decideIncomeUnderPlanned({
      availableCents: 500000n,
      plannedCents: 500000n,
    });
    expect(d.emit).toBe(false);
    expect(d.shortfallCents).toBe(0n);
  });

  test("available > planned → no emit", () => {
    const d = decideIncomeUnderPlanned({
      availableCents: 800000n,
      plannedCents: 500000n,
    });
    expect(d.emit).toBe(false);
  });

  test("planned zero → no emit", () => {
    const d = decideIncomeUnderPlanned({
      availableCents: 0n,
      plannedCents: 0n,
    });
    expect(d.emit).toBe(false);
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
