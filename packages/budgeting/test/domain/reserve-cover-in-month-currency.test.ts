/**
 * reserve-cover-in-month-currency.test.ts — owner, 261104: a past month whose
 * currency differs from the category's latest one reads ALL of its column in
 * its own currency, reserve used and overspent included. The month's overspend
 * is exact in its currency (spent − limit); the engine says what share of it
 * the reserve covered (in the latest currency). The share carries over.
 */
import { describe, test, expect } from "bun:test";
import { reserveCoverInMonthCurrency } from "../../src/domain/reserve-cover-in-month-currency";

describe("Reserve cover in the month's currency", () => {
  test("fully covered: used is the whole overspend, nothing left over", () => {
    expect(reserveCoverInMonthCurrency({ overMonth: 5000n, overLatest: 1167n, usedLatest: 1167n })).toEqual({
      usedCents: 5000n,
      overspentCents: 0n,
    });
  });

  test("not covered: all of it is overspent", () => {
    expect(reserveCoverInMonthCurrency({ overMonth: 5000n, overLatest: 1167n, usedLatest: 0n })).toEqual({
      usedCents: 0n,
      overspentCents: 5000n,
    });
  });

  test("partly covered: the same share, and the two add up to the overspend", () => {
    const r = reserveCoverInMonthCurrency({ overMonth: 5000n, overLatest: 1200n, usedLatest: 300n });
    expect(r).toEqual({ usedCents: 1250n, overspentCents: 3750n });
  });

  test("no overspend in the month: nothing used, nothing over", () => {
    expect(reserveCoverInMonthCurrency({ overMonth: 0n, overLatest: 0n, usedLatest: 0n })).toEqual({
      usedCents: 0n,
      overspentCents: 0n,
    });
  });
});
