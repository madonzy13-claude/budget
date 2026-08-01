/**
 * actual-over-plan.test.ts — colour the ACTUAL line by which plan band it is in.
 *
 * Three zones (260801): below NEEDS, between needs and needs+wants, and above the
 * whole plan. The line itself is drawn per zone and clipped to the plan regions
 * (see plan-zone-paths) — these are the pure pieces behind it: which zone a point
 * is in, and the sampler that traces the SAME shape the chart draws.
 */
import { describe, it, expect } from "vitest";
import { sampleSeries, spendZone } from "../../src/lib/actual-over-plan";

describe("spendZone", () => {
  // 260801 (user decision): the line is coloured by WHERE THE MONEY CAME FROM.
  // Limit 100, reserve 50, spent 175 → the first 100 is green, the next 50
  // yellow, the last 25 red: 57% / 28% / 15% of the line.
  const split = (real: number) => ({
    real,
    needs: 0,
    wants: 0,
    withinLimit: 100,
    reserveUsed: 50,
  });

  it("is 'under' up to and including what the limit covered", () => {
    expect(spendZone(split(40))).toBe("under");
    expect(spendZone(split(100))).toBe("under");
  });

  it("is 'between' across the reserve the month consumed", () => {
    expect(spendZone(split(101))).toBe("between");
    expect(spendZone(split(150))).toBe("between");
  });

  it("is 'over' past the limit and the reserve together", () => {
    expect(spendZone(split(151))).toBe("over");
    expect(spendZone(split(175))).toBe("over");
  });

  it("has no middle zone when no reserve was drawn", () => {
    expect(spendZone({ ...split(120), reserveUsed: 0 })).toBe("over");
  });
});

describe("sampleSeries", () => {
  it("returns the points themselves in linear mode", () => {
    expect(sampleSeries([0, 10, 5], { linear: true })).toEqual([
      { x: 0, v: 0 },
      { x: 1, v: 10 },
      { x: 2, v: 5 },
    ]);
  });

  it("sub-samples each segment for the curve, hitting every data point", () => {
    const out = sampleSeries([0, 10], { perSegment: 4 });
    expect(out.length).toBe(5);
    expect(out[0]).toEqual({ x: 0, v: 0 });
    expect(out[out.length - 1]).toEqual({ x: 1, v: 10 });
    // monotone: values rise across the segment
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.v).toBeGreaterThan(out[i - 1]!.v);
    }
  });

  it("handles a single point and an empty series", () => {
    expect(sampleSeries([7])).toEqual([{ x: 0, v: 7 }]);
    expect(sampleSeries([])).toEqual([]);
  });
});
