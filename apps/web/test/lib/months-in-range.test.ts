/**
 * months-in-range.test.ts — how many months a selected range covers (260805).
 *
 * The Overview totals are range sums; the figure beside them is what that comes
 * to in a month. Calendar months TOUCHED, not 30-day blocks: a range of 1–5 Feb
 * is one month's worth of spending however few days it is, and dividing by 0.16
 * of a month would invent a monstrous average.
 */
import { describe, it, expect } from "vitest";
import { monthsInRange } from "@/lib/months-in-range";

describe("monthsInRange", () => {
  it("counts a whole month as one", () => {
    expect(monthsInRange("2026-02-01", "2026-02-28")).toBe(1);
  });

  it("counts a few days of one month as that month", () => {
    expect(monthsInRange("2026-02-01", "2026-02-05")).toBe(1);
  });

  it("counts every calendar month the range touches", () => {
    expect(monthsInRange("2026-01-28", "2026-03-02")).toBe(3);
  });

  it("counts across a year boundary", () => {
    expect(monthsInRange("2025-11-15", "2026-02-01")).toBe(4);
  });

  it("never returns zero, whatever it is handed", () => {
    expect(monthsInRange("", "")).toBe(1);
    expect(monthsInRange("2026-03-01", "2026-01-01")).toBe(1);
  });
});

/**
 * The month still running counts as the DAYS it has had (user, 260810).
 *
 * Its spend is ten days old and its plan is pro-rated to ten days, but the
 * divisor counted it as a whole month — so both monthly figures were dragged
 * down by the twenty-one days that have not happened yet.
 */
describe("monthsInRange — the running month is a fraction of itself", () => {
  it("counts the part of this month that has actually passed", () => {
    // 1 Jul → 10 Aug: one whole July, plus 10/31 of August.
    expect(monthsInRange("2026-07-01", "2026-08-31", "2026-08-10")).toBeCloseTo(
      1 + 10 / 31,
      5,
    );
  });

  it("counts a finished month whole, however the range ends", () => {
    // Today is past the range: nothing is still running inside it.
    expect(monthsInRange("2026-06-01", "2026-07-31", "2026-08-10")).toBe(2);
  });

  it("is the elapsed days alone when the range IS this month", () => {
    expect(monthsInRange("2026-08-01", "2026-08-31", "2026-08-10")).toBeCloseTo(
      10 / 31,
      5,
    );
  });

  it("never divides by zero on the first of the month", () => {
    expect(
      monthsInRange("2026-08-01", "2026-08-31", "2026-08-01"),
    ).toBeGreaterThan(0);
  });

  it("keeps counting whole months when no today is given", () => {
    expect(monthsInRange("2026-07-01", "2026-08-31")).toBe(2);
  });
});
