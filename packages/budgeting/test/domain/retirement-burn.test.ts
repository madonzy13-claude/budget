/**
 * retirement-burn.test.ts — what a No-limit category costs a month, forever.
 *
 * User, 260820: the average of the last 12 months of spend, but never less than
 * the standing payments that run FOREVER. A category can look cheap in history
 * and still owe a perpetual bill.
 */
import { describe, test, expect } from "bun:test";
import { retirementBurn } from "../../src/domain/retirement-burn";

describe("retirementBurn", () => {
  test("averages the trailing months of spend", () => {
    expect(
      retirementBurn({
        trailingMonthlySpend: [30000n, 20000n, 10000n, 20000n],
        perpetualMonthlyCents: 0n,
      }),
    ).toBe(20000n);
  });

  test("averages over the months actually present, not a flat twelve", () => {
    expect(
      retirementBurn({
        trailingMonthlySpend: [30000n, 30000n, 30000n],
        perpetualMonthlyCents: 0n,
      }),
    ).toBe(30000n);
  });

  test("rounds the average half-up — understating the burn lengthens the runway", () => {
    expect(
      retirementBurn({
        trailingMonthlySpend: [10000n, 10001n],
        perpetualMonthlyCents: 0n,
      }),
    ).toBe(10001n);
  });

  test("never falls below the perpetual standing cost", () => {
    expect(
      retirementBurn({
        trailingMonthlySpend: [1000n, 1000n],
        perpetualMonthlyCents: 400000n,
      }),
    ).toBe(400000n);
  });

  test("history wins when it is the larger of the two", () => {
    expect(
      retirementBurn({
        trailingMonthlySpend: [900000n, 900000n],
        perpetualMonthlyCents: 400000n,
      }),
    ).toBe(900000n);
  });

  test("no history and nothing perpetual costs nothing", () => {
    expect(
      retirementBurn({
        trailingMonthlySpend: [],
        perpetualMonthlyCents: 0n,
      }),
    ).toBe(0n);
  });

  test("a brand-new category with only a standing bill burns that bill", () => {
    expect(
      retirementBurn({
        trailingMonthlySpend: [],
        perpetualMonthlyCents: 406271n,
      }),
    ).toBe(406271n);
  });
});
