/**
 * per-month-from-yearly.test.ts — the "Scheduled payments per year, by
 * category" tooltip lists each payment's working ("3,500 × 12m = 42,000") but
 * never said what the category costs PER MONTH, which is the figure a limit is
 * actually set in (user, 261016).
 *
 * A year divided by twelve, rounded to whole cents — the tooltip's other
 * figures are exact money, so this one is too.
 */
import { describe, it, expect } from "vitest";
import { perMonthFromYearlyCents } from "@/lib/per-month-from-yearly";

describe("perMonthFromYearlyCents", () => {
  it("splits a clean year into twelve", () => {
    // 42,000.00 / 12 = 3,500.00
    expect(perMonthFromYearlyCents(4_200_000)).toBe(350_000);
  });

  it("rounds to the nearest cent rather than truncating", () => {
    // 100.00 / 12 = 8.333… → 8.33
    expect(perMonthFromYearlyCents(10_000)).toBe(833);
  });

  it("rounds a half up, so twelve months never read short", () => {
    // 0.50 / 12 = 0.041666 → 4 (nearest cent)
    expect(perMonthFromYearlyCents(50)).toBe(4);
  });

  it("leaves nothing as nothing", () => {
    expect(perMonthFromYearlyCents(0)).toBe(0);
  });

  it("handles a negative year without inventing a sign", () => {
    expect(perMonthFromYearlyCents(-1200)).toBe(-100);
  });
});
