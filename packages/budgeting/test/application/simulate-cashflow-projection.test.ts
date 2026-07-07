// packages/budgeting/test/application/simulate-cashflow-projection.test.ts
import { describe, test, expect } from "bun:test";
import {
  simulateCashflow,
  type CashflowSimInput,
} from "@budget/budgeting/src/application/simulate-cashflow-projection";

/** Minimal July-15 → Aug-31 window, USD, one category, no events, no reserve. */
function base(overrides: Partial<CashflowSimInput> = {}): CashflowSimInput {
  return {
    today: "2026-07-15",
    windowEnd: "2026-08-31",
    currency: "USD",
    startCashCents: 100_000n,
    reservePoolCents: 0n,
    categories: [
      {
        id: "cat-food",
        name: "Food",
        budgetThisMonthCents: 30_000n,
        budgetNextMonthCents: 30_000n,
        spentSoFarCents: 0n,
      },
    ],
    incomePayments: [],
    bills: [],
    ...overrides,
  };
}

const dayOn = (p: ReturnType<typeof simulateCashflow>, date: string) =>
  p.days.find((d) => d.date === date)!;
const colorOn = (p: ReturnType<typeof simulateCashflow>, date: string) =>
  p.days.find((d) => d.date === date)?.color;

// Cash-based model: spending is paid from cash; only what cash can't cover dips
// into the reserve pot (the RESERVE-wallet money), and it depletes; when reserve
// is gone too, available (cash) goes negative → red. Reserve-covered spending
// never reduces available. Reserve used is attributed to the spending category.
describe("simulateCashflow", () => {
  test("plenty of cash, spending within cash → all green", () => {
    const p = simulateCashflow(base());
    expect(p.days[0]!.date).toBe("2026-07-15");
    expect(p.days.at(-1)!.date).toBe("2026-08-31");
    expect(p.days.every((d) => d.color === "green")).toBe(true);
    expect(p.summary.firstRedDate).toBeNull();
  });

  test("spending exceeds cash, no reserve → available goes negative → red", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 5_000n,
        reservePoolCents: 0n,
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 300_000n, // big discretionary burn
            budgetNextMonthCents: 300_000n,
            spentSoFarCents: 0n,
          },
        ],
      }),
    );
    expect(p.summary.firstRedDate).not.toBeNull();
    expect(colorOn(p, "2026-08-31")).toBe("red");
    expect(dayOn(p, "2026-08-31").availableCents).toBeLessThan(0n);
    expect(p.summary.worstShortfallCents).toBeGreaterThan(0n);
  });

  test("reserve covers a cash shortfall → yellow that day, available NOT reduced (stays ≥ 0)", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 100_000n, // reserve pot (RESERVE wallets)
        categories: [
          {
            id: "c",
            name: "Rent",
            budgetThisMonthCents: 0n, // no discretionary — only the bill
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          { date: "2026-07-20", name: "Rent", categoryId: "c", amountCents: 50_000n },
        ],
      }),
    );
    const d20 = dayOn(p, "2026-07-20");
    expect(d20.color).toBe("yellow"); // reserve used that day
    // reserve-covered spending is NOT subtracted from available
    expect(d20.availableCents).toBe(0n);
    expect(d20.drewReserve.find((r) => r.categoryId === "c")?.amountCents).toBe(
      50_000n,
    );
    // per-day: the next day (no spend) is green again
    expect(colorOn(p, "2026-07-21")).toBe("green");
    expect(dayOn(p, "2026-07-21").drewReserve).toHaveLength(0);
  });

  test("reserve exhausted → red with per-category shortfall; available goes negative", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 30_000n, // only 30k reserve
        categories: [
          {
            id: "c",
            name: "Rent",
            budgetThisMonthCents: 0n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          { date: "2026-07-20", name: "Rent", categoryId: "c", amountCents: 50_000n },
        ],
      }),
    );
    const d20 = dayOn(p, "2026-07-20");
    expect(d20.color).toBe("red");
    expect(d20.drewReserve.find((r) => r.categoryId === "c")?.amountCents).toBe(
      30_000n,
    ); // all reserve used
    expect(d20.shortfall.find((s) => s.categoryId === "c")?.amountCents).toBe(
      20_000n,
    ); // uncovered
    expect(d20.availableCents).toBe(-20_000n);
  });

  test("negative cash recovers to green once a paycheck lands", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 0n,
        categories: [
          {
            id: "c",
            name: "Rent",
            budgetThisMonthCents: 0n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          { date: "2026-07-20", name: "Rent", categoryId: "c", amountCents: 50_000n },
        ],
        incomePayments: [
          { date: "2026-07-25", name: "Salary", amountCents: 200_000n },
        ],
      }),
    );
    expect(colorOn(p, "2026-07-21")).toBe("red"); // underwater, no reserve
    expect(colorOn(p, "2026-07-26")).toBe("green"); // salary refilled cash
  });

  test("reserve is used ONLY on the day cash falls short (per-day)", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 100_000n,
        categories: [
          {
            id: "c",
            name: "Rent",
            budgetThisMonthCents: 0n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          { date: "2026-07-20", name: "Rent", categoryId: "c", amountCents: 40_000n },
        ],
      }),
    );
    expect(dayOn(p, "2026-07-20").drewReserve).toHaveLength(1);
    expect(dayOn(p, "2026-07-21").drewReserve).toHaveLength(0);
    expect(dayOn(p, "2026-08-05").drewReserve).toHaveLength(0);
  });

  test("empty budget: no categories, no events → flat green", () => {
    const p = simulateCashflow(base({ categories: [], startCashCents: 0n }));
    expect(p.days.every((d) => d.color === "green")).toBe(true);
  });
});
