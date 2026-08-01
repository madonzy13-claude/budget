/**
 * chart-ticks.test.ts — thinning a numeric time axis (260801).
 *
 * The planned chart puts its ticks ON the data points, so a daily range handed
 * recharts one tick per spend day and the labels printed on top of each other
 * (user screenshot: "1 Jul 2026" and "1 Aug 2026" overlapping).
 */
import { describe, it, expect } from "vitest";
import { monthFirstTicks, thinTimeTicks } from "../../src/lib/chart-ticks";

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("thinTimeTicks", () => {
  it("keeps everything when there is room", () => {
    const v = [day("2026-06-01"), day("2026-07-01"), day("2026-08-01")];
    expect(thinTimeTicks(v, 6)).toEqual(v);
  });

  it("drops ticks that would print on top of their neighbour", () => {
    const v = [
      day("2026-06-01"),
      day("2026-06-02"),
      day("2026-06-03"),
      day("2026-07-01"),
      day("2026-07-02"),
      day("2026-08-01"),
    ];
    const out = thinTimeTicks(v, 4);
    expect(out[0]).toBe(day("2026-06-01"));
    expect(out.at(-1)).toBe(day("2026-08-01"));
    // Every gap is at least a quarter-ish of the span — no two labels collide.
    const span = day("2026-08-01") - day("2026-06-01");
    for (let i = 1; i < out.length; i++)
      expect(out[i]! - out[i - 1]!).toBeGreaterThanOrEqual(span / 8);
  });

  it("always ends on the last point, never a near-duplicate of it", () => {
    const v = [
      day("2026-06-01"),
      day("2026-07-30"),
      day("2026-07-31"),
      day("2026-08-01"),
    ];
    const out = thinTimeTicks(v, 4);
    expect(out.at(-1)).toBe(day("2026-08-01"));
    expect(out).not.toContain(day("2026-07-31"));
  });

  it("passes through the trivial cases", () => {
    expect(thinTimeTicks([], 5)).toEqual([]);
    expect(thinTimeTicks([7], 5)).toEqual([7]);
  });
});

describe("monthFirstTicks", () => {
  // Past 1M the axis names months, so it needs ONE tick per month — otherwise
  // several days of the same month print the same label (260801 user request).
  it("keeps the first point of each month", () => {
    const v = [
      day("2026-06-01"),
      day("2026-06-09"),
      day("2026-06-25"),
      day("2026-07-01"),
      day("2026-07-14"),
      day("2026-08-01"),
    ];
    expect(monthFirstTicks(v)).toEqual([
      day("2026-06-01"),
      day("2026-07-01"),
      day("2026-08-01"),
    ]);
  });

  it("leaves one-point-per-month data untouched", () => {
    const v = [day("2026-03-31"), day("2026-04-30"), day("2026-05-31")];
    expect(monthFirstTicks(v)).toEqual(v);
  });

  it("is empty for no points", () => {
    expect(monthFirstTicks([])).toEqual([]);
  });
});
