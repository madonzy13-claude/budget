// packages/budgeting/test/application/simulate-cashflow-projection.test.ts
import { describe, test, expect } from "bun:test";
import {
  simulateCashflow,
  type CashflowSimInput,
} from "@budget/budgeting/src/application/simulate-cashflow-projection";

/** Minimal July-15 → Aug-31 window, USD, one category, no events. */
function base(overrides: Partial<CashflowSimInput> = {}): CashflowSimInput {
  return {
    today: "2026-07-15",
    windowEnd: "2026-08-31",
    currency: "USD",
    startCashCents: 100_000n,
    categories: [
      {
        id: "cat-food",
        name: "Food",
        budgetThisMonthCents: 30_000n,
        budgetNextMonthCents: 30_000n,
        spentSoFarCents: 0n,
        reserveCents: 0n,
      },
    ],
    incomePayments: [],
    bills: [],
    ...overrides,
  };
}

const colorOn = (p: ReturnType<typeof simulateCashflow>, date: string) =>
  p.days.find((d) => d.date === date)?.color;

describe("simulateCashflow", () => {
  test("plenty of cash, spend within plan → all green", () => {
    const p = simulateCashflow(base());
    expect(p.days[0]!.date).toBe("2026-07-15");
    expect(p.days.at(-1)!.date).toBe("2026-08-31");
    expect(p.days.every((d) => d.color === "green")).toBe(true);
    expect(p.summary.firstRedDate).toBeNull();
  });

  test("no income, cash drains below zero → red once underwater", () => {
    // Big daily discretionary, tiny cash, no income → goes red.
    const p = simulateCashflow(
      base({
        startCashCents: 5_000n,
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 300_000n,
            budgetNextMonthCents: 300_000n,
            spentSoFarCents: 0n,
            reserveCents: 0n,
          },
        ],
      }),
    );
    expect(p.summary.firstRedDate).not.toBeNull();
    expect(colorOn(p, "2026-08-31")).toBe("red");
    expect(p.summary.worstShortfallCents).toBeGreaterThan(0n);
  });

  test("cash dips then a paycheck lands → recovers to green (heat band)", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        // rent bill on the 20th drives cash negative; salary on the 25th refills.
        categories: [
          {
            id: "c",
            name: "Rent",
            budgetThisMonthCents: 0n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
            reserveCents: 0n,
          },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Rent",
            categoryId: "c",
            amountCents: 50_000n,
          },
        ],
        incomePayments: [
          { date: "2026-07-25", name: "Salary", amountCents: 200_000n },
        ],
      }),
    );
    expect(colorOn(p, "2026-07-21")).toBe("red"); // underwater, no reserve
    expect(colorOn(p, "2026-07-26")).toBe("green"); // salary landed
  });

  test("overspend a category, reserve absorbs it → yellow ONLY on the draw day (per-day, no stickiness)", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 1_000_000n, // cash never the problem
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 10_000n,
            budgetNextMonthCents: 10_000n,
            spentSoFarCents: 0n,
            reserveCents: 100_000n, // deep reserve
          },
        ],
        // one big bill that blows July's 10k plan but is well within reserve
        bills: [
          {
            date: "2026-07-20",
            name: "Feast",
            categoryId: "c",
            amountCents: 40_000n,
          },
        ],
      }),
    );
    expect(colorOn(p, "2026-07-19")).toBe("green");
    expect(colorOn(p, "2026-07-20")).toBe("yellow"); // reserve tapped THIS day
    expect(colorOn(p, "2026-07-31")).toBe("green"); // nothing happens after → green
    expect(colorOn(p, "2026-08-01")).toBe("green");
    const d20 = p.days.find((d) => d.date === "2026-07-20")!;
    expect(d20.drewReserve.some((r) => r.categoryId === "c")).toBe(true);
    // per-day: a later day with no draw carries no reserve line
    expect(
      p.days.find((d) => d.date === "2026-07-31")!.drewReserve,
    ).toHaveLength(0);
  });

  test("overspend beyond reserve → red with per-category shortfall", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 1_000_000n,
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 10_000n,
            budgetNextMonthCents: 10_000n,
            spentSoFarCents: 0n,
            reserveCents: 5_000n, // shallow reserve
          },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Feast",
            categoryId: "c",
            amountCents: 40_000n,
          },
        ],
      }),
    );
    expect(colorOn(p, "2026-07-20")).toBe("red");
    const d20 = p.days.find((d) => d.date === "2026-07-20")!;
    expect(d20.shortfall.some((s) => s.categoryId === "c")).toBe(true);
  });

  test("month boundary accrues unspent budget into reserve", () => {
    // July heavily underspent → leftover accrues to reserve, rescuing an Aug overspend.
    const p = simulateCashflow(
      base({
        startCashCents: 1_000_000n,
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 100_000n, // July plan, spend ~0 discretionary via bills-only
            budgetNextMonthCents: 10_000n, // Aug plan tiny
            spentSoFarCents: 0n,
            reserveCents: 0n,
          },
        ],
        // July has no bills; 100k budget spreads evenly → 17 days × 5882 = 99994 burned,
        // 6 cents leftover accrues to reserve at month boundary.
        // Aug bill overshoots Aug 10k plan by exactly 6 cents → reserve covers it exactly.
        bills: [
          {
            date: "2026-08-15",
            name: "Feast",
            categoryId: "c",
            amountCents: 10_006n, // 10k Aug budget + 6 cent overshoot = covered by July's accrued 6 cents
          },
        ],
      }),
    );
    // Aug 15 overspends Aug's 10k plan by 6 cents; July accrued exactly 6 cents → yellow (reserve tapped), not red.
    expect(colorOn(p, "2026-08-15")).not.toBe("red");
  });

  test("empty budget: no categories, no events → flat green", () => {
    const p = simulateCashflow(base({ categories: [], startCashCents: 0n }));
    expect(p.days.every((d) => d.color === "green")).toBe(true);
  });

  test("reserve draw is reported ONLY on the day it happens (per-day, not cumulative)", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 1_000_000n, // cash never the problem
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 10_000n,
            budgetNextMonthCents: 10_000n,
            spentSoFarCents: 0n,
            reserveCents: 100_000n,
          },
        ],
        bills: [
          { date: "2026-07-20", name: "Feast", categoryId: "c", amountCents: 40_000n },
        ],
      }),
    );
    // The $30k over-plan draws reserve ONLY on the 20th; later days show nothing
    // (no reserve is used on them).
    const d20 = p.days.find((d) => d.date === "2026-07-20")!;
    expect(d20.drewReserve.find((r) => r.categoryId === "c")?.amountCents).toBe(30_000n);
    expect(p.days.find((d) => d.date === "2026-07-31")!.drewReserve).toHaveLength(0);
    expect(p.days.find((d) => d.date === "2026-08-05")!.drewReserve).toHaveLength(0);
  });

  test("reserveCover reports how much reserve bridges a negative-cash day", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        categories: [
          {
            id: "c",
            name: "Rent",
            budgetThisMonthCents: 0n, // no plan → pure liquidity case
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
            reserveCents: 100_000n,
          },
        ],
        bills: [
          { date: "2026-07-20", name: "Rent", categoryId: "c", amountCents: 50_000n },
        ],
      }),
    );
    const d20 = p.days.find((d) => d.date === "2026-07-20")!;
    expect(d20.color).toBe("yellow"); // cash −50k, 100k reserve pool covers it
    expect(d20.reserveCoverCents).toBe(50_000n);
  });
});
