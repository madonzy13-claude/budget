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
          {
            date: "2026-07-20",
            name: "Rent",
            categoryId: "c",
            amountCents: 50_000n,
          },
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
          {
            date: "2026-07-20",
            name: "Rent",
            categoryId: "c",
            amountCents: 50_000n,
          },
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
          {
            date: "2026-07-20",
            name: "Rent",
            categoryId: "c",
            amountCents: 40_000n,
          },
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

/**
 * Reserve covers OVERSPEND, not "ran out of cash" (user, 260811).
 *
 * The forecast drew on the reserve pot the moment cash could not pay, so a bill
 * that fitted comfortably inside its category's untouched limit still coloured
 * the day yellow — "you dipped into reserves" — when the truth was simply that
 * the spending wallets were empty. Reserve money is earmarked against limits
 * being exceeded; it is not a general overdraft.
 *
 * So: within the limit, cash is the only payer, and falling short of it is RED.
 * Only the part of an outflow BEYOND the category's remaining limit may draw
 * reserve, and only that turns a day yellow.
 */
describe("simulateCashflow — reserve only covers spending past the limit", () => {
  test("bill inside an untouched limit + no cash → RED, reserve untouched", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 100_000n,
        categories: [
          {
            id: "cat-food",
            name: "Food",
            budgetThisMonthCents: 100_000n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Groceries",
            amountCents: 50_000n,
            categoryId: "cat-food",
          },
        ],
      }),
    );
    const d = dayOn(p, "2026-07-20");
    expect(d.drewReserve).toEqual([]);
    expect(d.color).toBe("red");
    expect(d.availableCents).toBeLessThan(0n);
  });

  test("the part BEYOND the limit may draw reserve → yellow", () => {
    // Limit 300, bill 500: 300 of it is inside the limit and is paid by the 300
    // of cash; the 200 of overspend is what the reserve is for.
    const p = simulateCashflow(
      base({
        startCashCents: 30_000n,
        reservePoolCents: 100_000n,
        categories: [
          {
            id: "cat-food",
            name: "Food",
            budgetThisMonthCents: 30_000n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Big shop",
            amountCents: 50_000n,
            categoryId: "cat-food",
          },
        ],
      }),
    );
    const d = dayOn(p, "2026-07-20");
    expect(d.drewReserve).toEqual([
      { categoryId: "cat-food", name: "Food", amountCents: 20_000n },
    ]);
    expect(d.color).toBe("yellow");
    expect(d.availableCents).toBe(0n);
  });

  test("a limit already spent leaves every further bill reserve-eligible", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 100_000n,
        categories: [
          {
            id: "cat-food",
            name: "Food",
            budgetThisMonthCents: 30_000n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 30_000n, // limit already used up
          },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Extra",
            amountCents: 10_000n,
            categoryId: "cat-food",
          },
        ],
      }),
    );
    const d = dayOn(p, "2026-07-20");
    expect(d.drewReserve).toEqual([
      { categoryId: "cat-food", name: "Food", amountCents: 10_000n },
    ]);
    expect(d.color).toBe("yellow");
  });

  test("overspend beyond BOTH cash and reserve is still red", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 5_000n,
        categories: [
          {
            id: "cat-food",
            name: "Food",
            budgetThisMonthCents: 0n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Extra",
            amountCents: 10_000n,
            categoryId: "cat-food",
          },
        ],
      }),
    );
    const d = dayOn(p, "2026-07-20");
    expect(d.drewReserve).toEqual([
      { categoryId: "cat-food", name: "Food", amountCents: 5_000n },
    ]);
    expect(d.color).toBe("red");
  });
});

// The forecast line is only trustworthy if the user can read WHY a day fell by
// what it fell. Every day therefore carries the terms of one equation:
//   available = opening + income − bills − plannedBurn + reserveCovered
// (reserve-covered spending is paid from the pot, so it never reduces cash).
describe("simulateCashflow — the day's arithmetic", () => {
  test("first day opens on the wallet balance, not one burn below it", () => {
    const p = simulateCashflow(base());
    const first = p.days[0]!;
    expect(first.openingCents).toBe(100_000n);
    // 30_000 over 17 days left in July (15th → 31st) = 1_764/day.
    expect(first.plannedBurnCents).toBe(1_764n);
    expect(first.availableCents).toBe(100_000n - 1_764n);
  });

  test("every day's terms add up to that day's available", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 20_000n,
        reservePoolCents: 50_000n,
        incomePayments: [
          { date: "2026-07-25", name: "Salary", amountCents: 200_000n },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Rent",
            amountCents: 60_000n,
            categoryId: "cat-food",
          },
        ],
      }),
    );
    for (const d of p.days) {
      expect(
        d.openingCents +
          d.incomeCents -
          d.billCents -
          d.plannedBurnCents +
          d.reserveCoveredCents,
      ).toBe(d.availableCents);
    }
    // Each day opens exactly where the previous one closed.
    for (let i = 1; i < p.days.length; i++) {
      expect(p.days[i]!.openingCents).toBe(p.days[i - 1]!.availableCents);
    }
  });

  test("reserve-covered spending shows up as a term, not as lost cash", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 100_000n,
        categories: [
          {
            id: "cat-food",
            name: "Food",
            budgetThisMonthCents: 0n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Extra",
            amountCents: 10_000n,
            categoryId: "cat-food",
          },
        ],
      }),
    );
    const d = dayOn(p, "2026-07-20");
    expect(d.reserveCoveredCents).toBe(10_000n);
    expect(d.availableCents).toBe(0n);
  });

  test("pending unconfirmed drafts ride along without moving cash", () => {
    const pending = [
      { date: "2026-07-05", name: "T-Mobile", amountCents: 3_000n },
    ];
    const withPending = simulateCashflow(base({ pendingDrafts: pending }));
    const without = simulateCashflow(base());
    expect(withPending.pendingPoints).toEqual([
      {
        date: "2026-07-05",
        name: "T-Mobile",
        categoryId: null,
        amountCents: 3_000n,
      },
    ]);
    // Its money is already inside the discretionary burn — counting it again
    // would draw the same payment twice.
    expect(withPending.days.map((d) => d.availableCents)).toEqual(
      without.days.map((d) => d.availableCents),
    );
  });
});
