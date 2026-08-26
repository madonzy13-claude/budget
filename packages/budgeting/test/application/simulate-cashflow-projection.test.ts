// packages/budgeting/test/application/simulate-cashflow-projection.test.ts
import { describe, test, expect } from "bun:test";
import {
  simulateCashflow,
  type CashflowSimInput,
} from "@budget/budgeting/src/application/simulate-cashflow-projection";

/** Minimal July-15 → Aug-31 window, USD, one category, no events, no reserve. */
function base(overrides: Partial<CashflowSimInput> = {}): CashflowSimInput {
  const input: CashflowSimInput = {
    today: "2026-07-15",
    windowEnd: "2026-08-31",
    currency: "USD",
    startCashCents: 100_000n,
    reservePoolCents: 0n,
    categories: [
      {
        id: "cat-food",
        name: "Food",
        budgetByMonth: { "2026-07": 30_000n, "2026-08": 30_000n },
        spentSoFarCents: 0n,
      },
    ],
    incomePayments: [],
    bills: [],
    ...overrides,
  };
  // Reserve became per-category on 260812. These fixtures are about the
  // cash-vs-reserve mechanics rather than about WHOSE reserve it is, so unless a
  // test says otherwise every category is assumed to have built the whole pot —
  // which is exactly what they assumed before. The tests that care state their
  // own split (see "a category may only draw its OWN reserve").
  if (!input.reserveByCategory) {
    input.reserveByCategory = Object.fromEntries(
      input.categories.map((c) => [c.id, input.reservePoolCents]),
    );
  }
  return input;
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
            // big discretionary burn
            budgetByMonth: { "2026-07": 300_000n, "2026-08": 300_000n },
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
            // no discretionary — only the bill
            budgetByMonth: { "2026-07": 0n, "2026-08": 0n },
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
            budgetByMonth: { "2026-07": 0n, "2026-08": 0n },
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
            budgetByMonth: { "2026-07": 0n, "2026-08": 0n },
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
            budgetByMonth: { "2026-07": 0n, "2026-08": 0n },
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
            budgetByMonth: { "2026-07": 100_000n, "2026-08": 0n },
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
            budgetByMonth: { "2026-07": 30_000n, "2026-08": 0n },
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
            budgetByMonth: { "2026-07": 30_000n, "2026-08": 0n },
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
            budgetByMonth: { "2026-07": 0n, "2026-08": 0n },
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
            budgetByMonth: { "2026-07": 0n, "2026-08": 0n },
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

  test("a pending draft with no category comes straight off the cash", () => {
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
    // No category means no plan standing behind it — the same reading
    // applyOutflow already gives an uncategorised bill — so there is no burn for
    // it to hide inside and every złoty of it is owed on top. This test used to
    // assert the opposite; that assumption is what let "free to move" offer
    // money already spent (user, 260825).
    expect(withPending.days.map((d) => d.availableCents)).toEqual(
      without.days.map((d) => d.availableCents - 3_000n),
    );
  });
});

/**
 * SAFE TO WITHDRAW (user, 260812).
 *
 * "Surplus" is the money you can take out of the budget today — to invest, say —
 * and still cover every dip the forecast knows about, right to the end of the
 * window. So it is the LOWEST point of the line, not the cash on some chosen
 * day, and it must not move just because a day passed.
 *
 * Stability comes from the schedule: the remaining plan is assumed spendable
 * IMMEDIATELY (`spendTiming: "immediate"`) rather than dripped evenly. That is
 * the worst case, which is the only honest basis for "can I take this out?",
 * and it does not depend on where today sits in the month.
 */
describe("simulateCashflow — safe to withdraw", () => {
  const threeMonths = (over: Partial<CashflowSimInput> = {}) =>
    base({
      today: "2026-07-15",
      windowEnd: "2026-10-22", // 100 days
      startCashCents: 500_000n,
      categories: [
        {
          id: "cat-food",
          name: "Food",
          budgetByMonth: {
            "2026-07": 30_000n,
            "2026-08": 30_000n,
            "2026-09": 30_000n,
            "2026-10": 30_000n,
          },
          spentSoFarCents: 0n,
        },
      ],
      ...over,
    });

  test("the figure is the deepest point of the line", () => {
    const p = simulateCashflow(
      threeMonths({
        spendTiming: "immediate",
        bills: [
          {
            date: "2026-08-10",
            name: "Rent",
            amountCents: 100_000n,
            categoryId: null,
          },
        ],
      }),
    );
    const lowest = p.days.reduce(
      (m, d) => (d.availableCents < m ? d.availableCents : m),
      p.days[0]!.availableCents,
    );
    expect(p.safeToWithdraw.cents).toBe(lowest);
    expect(p.safeToWithdraw.thinnestDate).toBe(
      p.days.find((d) => d.availableCents === lowest)!.date,
    );
  });

  test("a day passing with nothing spent does not move it", () => {
    const at = (today: string) =>
      simulateCashflow(threeMonths({ today, spendTiming: "immediate" }))
        .safeToWithdraw.cents;
    // Same wallets, same plan, same bills — only the calendar moved.
    expect(at("2026-07-16")).toBe(at("2026-07-15"));
    expect(at("2026-07-20")).toBe(at("2026-07-15"));
  });

  test("spending INSIDE the plan does not move it either", () => {
    const plain = simulateCashflow(threeMonths({ spendTiming: "immediate" }))
      .safeToWithdraw.cents;
    const spent = simulateCashflow(
      threeMonths({
        spendTiming: "immediate",
        startCashCents: 500_000n - 10_000n, // the money left the wallet…
        categories: [
          {
            id: "cat-food",
            name: "Food",
            budgetByMonth: {
              "2026-07": 30_000n,
              "2026-08": 30_000n,
              "2026-09": 30_000n,
              "2026-10": 30_000n,
            },
            spentSoFarCents: 10_000n, // …against the plan that reserved it
          },
        ],
      }),
    ).safeToWithdraw.cents;
    expect(spent).toBe(plain);
  });

  test("overspending DOES move it, złoty for złoty", () => {
    const plain = simulateCashflow(threeMonths({ spendTiming: "immediate" }))
      .safeToWithdraw.cents;
    const over = simulateCashflow(
      threeMonths({
        spendTiming: "immediate",
        startCashCents: 500_000n - 40_000n,
        categories: [
          {
            id: "cat-food",
            name: "Food",
            budgetByMonth: {
              "2026-07": 30_000n,
              "2026-08": 30_000n,
              "2026-09": 30_000n,
              "2026-10": 30_000n,
            },
            spentSoFarCents: 40_000n, // 10_000 beyond July's plan
          },
        ],
      }),
    ).safeToWithdraw.cents;
    expect(plain - over).toBe(10_000n);
  });

  test("withdrawing exactly that much leaves the line touching zero", () => {
    const input = threeMonths({ spendTiming: "immediate" });
    const safe = simulateCashflow(input).safeToWithdraw.cents;
    const after = simulateCashflow({
      ...input,
      startCashCents: input.startCashCents - safe,
    });
    const lowest = after.days.reduce(
      (m, d) => (d.availableCents < m ? d.availableCents : m),
      after.days[0]!.availableCents,
    );
    expect(lowest).toBe(0n);
  });

  test("a reserve standing behind an over-limit bill keeps the figure up", () => {
    // The case the household named (user, 260812): a scheduled payment lands
    // that the category's remaining plan cannot absorb — a big one-off, or a
    // limit already eaten before the bill arrived. Cash can't cover it either.
    // That is exactly what the reserve is for, so the withdrawable figure may
    // lean on it rather than reading the day as a hole.
    const scenario = (reservePoolCents: bigint) =>
      simulateCashflow(
        threeMonths({
          spendTiming: "immediate",
          startCashCents: 40_000n,
          reservePoolCents,
          categories: [
            {
              id: "cat-food",
              name: "Food",
              // Nothing planned until the month the payment lands in.
              budgetByMonth: { "2026-09": 30_000n },
              spentSoFarCents: 0n,
            },
          ],
          bills: [
            {
              date: "2026-09-10",
              name: "Excess",
              amountCents: 90_000n,
              categoryId: "cat-food",
            },
          ],
        }),
      ).safeToWithdraw.cents;

    // 90_000 bill: 30_000 sits inside the plan, 60_000 is beyond it. Cash pays
    // 40_000 and runs out; of the 50_000 left, all of it is beyond-plan, so the
    // pot covers it and the line bottoms out AT zero instead of below it.
    expect(scenario(100_000n)).toBe(0n);
    expect(scenario(0n)).toBe(-50_000n);
  });

  test("each month's own plan is charged — a 100-day window spans four of them", () => {
    const p = simulateCashflow(threeMonths({ spendTiming: "immediate" }));
    expect(p.days).toHaveLength(100);
    // 4 monthly plans of 30_000 are charged across the window
    const burned = p.days.reduce((a, d) => a + d.plannedBurnCents, 0n);
    expect(burned).toBe(120_000n);
  });
});

/**
 * RESERVE IS PER CATEGORY (user, 260812 — reported from the live app).
 *
 * A 70,000 zł one-off in Sport drew 16,212 zł of "reserve" on the forecast —
 * which was the household's ENTIRE reserve pot, every złoty of it earmarked for
 * other categories. Sport has no reserve of its own. The pot is not a common
 * overdraft: each category may only spend the reserve it has actually built,
 * and the RESERVE wallets cap the lot (Σ R can exceed the real money).
 */
describe("simulateCashflow — a category may only draw its OWN reserve", () => {
  const overspendingBill = (categoryId: string, amountCents: bigint) => ({
    date: "2026-07-20",
    name: "One-off",
    categoryId,
    amountCents,
  });

  test("a category with no reserve of its own gets nothing, however full the pot", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 1_621_200n, // the whole household pot
        reserveByCategory: { "cat-other": 1_621_200n },
        categories: [
          {
            id: "cat-sport",
            name: "Sport",
            budgetByMonth: { "2026-07": 0n, "2026-08": 0n },
            spentSoFarCents: 0n,
          },
        ],
        bills: [overspendingBill("cat-sport", 7_000_000n)],
      }),
    );
    const d = dayOn(p, "2026-07-20");
    expect(d.drewReserve).toEqual([]);
    expect(d.shortfall).toEqual([
      { categoryId: "cat-sport", name: "Sport", amountCents: 7_000_000n },
    ]);
    expect(d.color).toBe("red");
  });

  test("it draws its own, and no further", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 1_000_000n,
        reserveByCategory: { "cat-sport": 5_000n },
        categories: [
          {
            id: "cat-sport",
            name: "Sport",
            budgetByMonth: { "2026-07": 0n, "2026-08": 0n },
            spentSoFarCents: 0n,
          },
        ],
        bills: [overspendingBill("cat-sport", 8_000n)],
      }),
    );
    const d = dayOn(p, "2026-07-20");
    expect(d.drewReserve).toEqual([
      { categoryId: "cat-sport", name: "Sport", amountCents: 5_000n },
    ]);
    expect(d.shortfall).toEqual([
      { categoryId: "cat-sport", name: "Sport", amountCents: 3_000n },
    ]);
  });

  test("its own reserve depletes — a second call finds it spent", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 1_000_000n,
        reserveByCategory: { "cat-sport": 5_000n },
        categories: [
          {
            id: "cat-sport",
            name: "Sport",
            budgetByMonth: { "2026-07": 0n, "2026-08": 0n },
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          overspendingBill("cat-sport", 5_000n),
          {
            date: "2026-07-25",
            name: "Another",
            categoryId: "cat-sport",
            amountCents: 5_000n,
          },
        ],
      }),
    );
    expect(dayOn(p, "2026-07-20").drewReserve).toHaveLength(1);
    expect(dayOn(p, "2026-07-25").drewReserve).toEqual([]);
    expect(dayOn(p, "2026-07-25").shortfall).toHaveLength(1);
  });

  test("the RESERVE wallets are still the ceiling over all categories", () => {
    // Σ R = 20_000 on the books, but only 12_000 of real money behind it.
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 12_000n,
        reserveByCategory: { a: 10_000n, b: 10_000n },
        categories: [
          {
            id: "a",
            name: "A",
            budgetByMonth: { "2026-07": 0n },
            spentSoFarCents: 0n,
          },
          {
            id: "b",
            name: "B",
            budgetByMonth: { "2026-07": 0n },
            spentSoFarCents: 0n,
          },
        ],
        bills: [
          overspendingBill("a", 10_000n),
          {
            date: "2026-07-21",
            name: "One-off",
            categoryId: "b",
            amountCents: 10_000n,
          },
        ],
      }),
    );
    const drew = p.days.reduce(
      (sum, d) => sum + d.drewReserve.reduce((s, r) => s + r.amountCents, 0n),
      0n,
    );
    expect(drew).toBe(12_000n);
  });

  test("an outflow with no category has no reserve to reach for", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        reservePoolCents: 100_000n,
        reserveByCategory: { "cat-food": 100_000n },
        bills: [
          {
            date: "2026-07-20",
            name: "Unassigned",
            categoryId: null,
            amountCents: 9_000n,
          },
        ],
      }),
    );
    expect(dayOn(p, "2026-07-20").drewReserve).toEqual([]);
  });
});

// An occurrence whose date has passed with no answer yet is money the household
// still holds and has already committed: wallet balances are hand-maintained, so
// the złoty is still inside startCashCents, and the bill is still owed. It has to
// come off the opening cash — and off the plan it consumed, or the same money is
// charged twice (user, 260825: "Free to move" offered 3,473 zł with 4,062.71 zł
// of unconfirmed House occurrences sitting in the ledger).
describe("simulateCashflow — unconfirmed occurrences are already committed", () => {
  const window100 = (over: Partial<CashflowSimInput> = {}) =>
    base({
      today: "2026-07-15",
      windowEnd: "2026-10-22",
      startCashCents: 500_000n,
      spendTiming: "immediate",
      ...over,
    });

  const draft = (
    amountCents: bigint,
    date = "2026-07-15",
    categoryId: string | null = "cat-food",
  ) => ({ date, name: "Rent", categoryId, amountCents });

  test("an unbounded category's pending occurrence still leaves the budget", () => {
    // no_limit → plan 0 → no burn at all, so today NOTHING represents it.
    const unbounded = [
      {
        id: "cat-house",
        name: "House",
        budgetByMonth: {},
        spentSoFarCents: 0n,
        noLimit: true,
      },
    ];
    const without = simulateCashflow(window100({ categories: unbounded }))
      .safeToWithdraw.cents;
    const withDraft = simulateCashflow(
      window100({
        categories: unbounded,
        pendingDrafts: [draft(40_000n, "2026-07-15", "cat-house")],
      }),
    ).safeToWithdraw.cents;
    expect(without - withDraft).toBe(40_000n);
  });

  test("one that fits inside the plan does not move the figure", () => {
    // The plan already stood ready to pay it, so charging BOTH would count the
    // same money twice. Budget 30,000 a month, nothing spent, draft 10,000.
    const without = simulateCashflow(window100()).safeToWithdraw.cents;
    const withDraft = simulateCashflow(
      window100({ pendingDrafts: [draft(10_000n)] }),
    ).safeToWithdraw.cents;
    expect(withDraft).toBe(without);
  });

  test("only the part BEYOND the plan bites further", () => {
    // Plan 30,000, draft 50,000 → 20,000 has no plan behind it.
    const without = simulateCashflow(window100()).safeToWithdraw.cents;
    const withDraft = simulateCashflow(
      window100({ pendingDrafts: [draft(50_000n)] }),
    ).safeToWithdraw.cents;
    expect(without - withDraft).toBe(20_000n);
  });

  test("one dated in an earlier month is owed in full — that plan is gone", () => {
    const without = simulateCashflow(window100()).safeToWithdraw.cents;
    const withDraft = simulateCashflow(
      window100({ pendingDrafts: [draft(10_000n, "2026-06-20")] }),
    ).safeToWithdraw.cents;
    expect(without - withDraft).toBe(10_000n);
  });

  // The all-budgets card reports Σ worstShortfallCents as the household DEFICIT,
  // so an unanswered occurrence has to reach that number too — not just the
  // withdrawable figure. Both runs share the subtraction, and `summary` comes
  // from the EVEN one, which is the run asserted here.
  test("an unanswered occurrence deepens the deficit the card reports", () => {
    const unbounded = [
      {
        id: "cat-house",
        name: "House",
        budgetByMonth: {},
        spentSoFarCents: 0n,
        noLimit: true,
      },
    ];
    const thin = { categories: unbounded, startCashCents: 20_000n };
    expect(simulateCashflow(window100(thin)).summary.worstShortfallCents).toBe(
      0n,
    );
    const short = simulateCashflow(
      window100({
        ...thin,
        pendingDrafts: [draft(50_000n, "2026-07-15", "cat-house")],
      }),
    );
    // 20,000 of cash against 50,000 owed → 30,000 uncovered, from day one.
    expect(short.summary.worstShortfallCents).toBe(30_000n);
    expect(short.summary.firstRedDate).toBe("2026-07-15");
  });

  // ...but only where no plan already stood ready to pay it. This is the guard
  // that keeps the deficit honest on a normal budget: the household's own
  // Family Budget carries two unanswered occurrences that sit inside their
  // categories' limits, and they must not inflate its deficit (user, 260826).
  test("one that fits inside the plan does not deepen it", () => {
    const plain = simulateCashflow(window100({ startCashCents: 20_000n }));
    const withDraft = simulateCashflow(
      window100({ startCashCents: 20_000n, pendingDrafts: [draft(10_000n)] }),
    );
    expect(withDraft.summary.worstShortfallCents).toBe(
      plain.summary.worstShortfallCents,
    );
  });

  // An unanswered occurrence is an OUTFLOW like any other, so the part of it
  // that lies beyond the category's plan must be able to reach that category's
  // reserve — which is exactly what a reserve is for. Until now it was
  // subtracted straight from the opening cash instead, so the same money
  // charged as a scheduled bill drew on the pot and charged as an unanswered
  // occurrence did not (user, 260826).
  const reserved = (over: Partial<CashflowSimInput> = {}) =>
    window100({
      startCashCents: 40_000n,
      reservePoolCents: 100_000n,
      reserveByCategory: { "cat-food": 100_000n },
      spendTiming: "even",
      ...over,
    });

  test("the part beyond the plan draws on the category's own reserve", () => {
    // Plan 30,000/month, 40,000 cash, a 50,000 occurrence → 20,000 of it lies
    // beyond the plan, and the pot is there to cover it.
    const p = simulateCashflow(reserved({ pendingDrafts: [draft(50_000n)] }));
    const drawn = p.days.reduce((a, d) => a + d.reserveCoveredCents, 0n);
    expect(drawn).toBeGreaterThan(0n);
    // The day the pot pays is yellow — the reserve doing its job is not a
    // deficit, and it used to paint plain red here.
    expect(p.days[0]!.color).toBe("yellow");
    // …and the deficit is smaller by exactly what the pot covered.
    const bare = simulateCashflow(
      reserved({
        pendingDrafts: [draft(50_000n)],
        reservePoolCents: 0n,
        reserveByCategory: {},
      }),
    );
    expect(
      bare.summary.worstShortfallCents - p.summary.worstShortfallCents,
    ).toBe(drawn);
  });

  test("it may only draw the reserve ITS OWN category built", () => {
    const p = simulateCashflow(
      reserved({
        pendingDrafts: [draft(50_000n)],
        // The pot is full, but Food has built none of it.
        reserveByCategory: { "cat-other": 100_000n },
      }),
    );
    expect(p.days.reduce((a, d) => a + d.reserveCoveredCents, 0n)).toBe(0n);
  });

  test("an unbounded category's occurrence never reaches the pot", () => {
    // 0083: unbounded spending is never overspend, so it is never the pot's job.
    const p = simulateCashflow(
      reserved({
        categories: [
          {
            id: "cat-house",
            name: "House",
            budgetByMonth: {},
            spentSoFarCents: 0n,
            noLimit: true,
          },
        ],
        reserveByCategory: { "cat-house": 100_000n },
        pendingDrafts: [draft(50_000n, "2026-07-15", "cat-house")],
      }),
    );
    expect(p.days.reduce((a, d) => a + d.reserveCoveredCents, 0n)).toBe(0n);
  });

  test("one from an earlier month is beyond ANY plan, so all of it may draw", () => {
    // The month whose plan would have paid it is behind us, so none of it is
    // in-plan — and it must not eat THIS month's headroom either.
    const p = simulateCashflow(
      reserved({ pendingDrafts: [draft(50_000n, "2026-06-20")] }),
    );
    expect(p.days.reduce((a, d) => a + d.reserveCoveredCents, 0n)).toBe(
      10_000n,
    );
  });

  test("the day's equation still adds up with an occurrence in it", () => {
    const p = simulateCashflow(reserved({ pendingDrafts: [draft(50_000n)] }));
    const d = p.days[0]!;
    // opening + income − bills − burn − pending + reserveCovered = available
    expect(
      d.openingCents +
        d.incomeCents -
        d.billCents -
        d.plannedBurnCents -
        d.pendingCents +
        d.reserveCoveredCents,
    ).toBe(d.availableCents);
    // Day one carries them; no later day repeats the charge.
    expect(d.pendingCents).toBe(50_000n);
    expect(p.days.slice(1).every((x) => x.pendingCents === 0n)).toBe(true);
  });

  test("the tooltip still lists every one of them", () => {
    const p = simulateCashflow(
      window100({
        pendingDrafts: [draft(10_000n), draft(2_500n, "2026-06-20")],
      }),
    );
    expect(p.pendingPoints.map((e) => e.amountCents)).toEqual([
      10_000n,
      2_500n,
    ]);
  });
});
