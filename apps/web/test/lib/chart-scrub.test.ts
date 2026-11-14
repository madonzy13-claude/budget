import { describe, expect, it } from "vitest";
import { nearestIndex, seriesTops, returnBetween } from "@/lib/chart-scrub";

describe("chart scrub helpers", () => {
  it("nearestIndex picks the closest point, clamping past either end", () => {
    const xs = [10, 20, 40, 80];
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 14)).toBe(0);
    expect(nearestIndex(xs, 16)).toBe(1);
    expect(nearestIndex(xs, 61)).toBe(3);
    expect(nearestIndex(xs, 500)).toBe(3);
    expect(nearestIndex([], 5)).toBe(-1);
  });

  it("seriesTops stacks a stack and leaves a lone series alone", () => {
    const series = [
      { key: "contributions", label: "", stack: "inv" },
      { key: "profit", label: "", stack: "inv" },
      { key: "plan", label: "" },
    ];
    expect(
      seriesTops({ contributions: 100, profit: 30, plan: 200 }, series),
    ).toEqual({ contributions: 100, profit: 130, plan: 200 });
    expect(seriesTops({ contributions: 5, profit: null }, series)).toEqual({
      contributions: 5,
    });
  });

  it("returnBetween chains two from-start returns", () => {
    // +10% then the whole range +21% → +10% between them.
    expect(returnBetween(10, 21)).toBeCloseTo(10, 10);
    expect(returnBetween(0, -5)).toBeCloseTo(-5, 10);
  });
});
