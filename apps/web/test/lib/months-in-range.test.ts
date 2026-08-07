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
