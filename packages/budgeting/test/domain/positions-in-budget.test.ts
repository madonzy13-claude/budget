// positionsInBudget — engine values are in each category's own currency
// (Phase 14, D-10); budget-level readers (reserve fit, overview, cash flow)
// need them in the budget currency at today's rate.
import { describe, test, expect } from "bun:test";
import { positionsInBudget, type ReservePositionsResult } from "../../src/application/get-reserve-positions";

const cell = { usedCents: 1000n, overspentCents: 0n, overageCents: 1000n, leftCents: 0n, endReserveCents: 4000n };
const result = {
  positions: new Map([
    ["eur", { categoryId: "eur", reserveCents: 5000n, usedCents: 1000n, overspentCents: 0n, reserveExcluded: false, byMonth: new Map([["2026-05", cell]]) }],
    ["pln", { categoryId: "pln", reserveCents: 2000n, usedCents: 0n, overspentCents: 0n, reserveExcluded: false, byMonth: new Map() }],
  ]),
  categoryCurrency: new Map([["eur", "EUR"], ["pln", "PLN"]]),
  rateToBudget: new Map<string, string | null>([["EUR", "4.0"], ["PLN", "1"]]),
} as unknown as ReservePositionsResult;

describe("positionsInBudget", () => {
  test("converts a foreign category's reserve values at today's rate", () => {
    const m = positionsInBudget(result, "PLN");
    expect(m.get("eur")?.reserveCents).toBe(20000n);
    expect(m.get("eur")?.byMonth.get("2026-05")).toEqual({
      usedCents: 4000n, overspentCents: 0n, overageCents: 4000n, leftCents: 0n, endReserveCents: 16000n,
    });
    expect(m.get("pln")?.reserveCents).toBe(2000n);
  });

  test("a result without currencies (older loaders) passes through", () => {
    const plain = { positions: result.positions } as ReservePositionsResult;
    expect(positionsInBudget(plain, "PLN")).toBe(result.positions);
  });
});
