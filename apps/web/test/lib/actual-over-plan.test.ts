/**
 * actual-over-plan.test.ts — colour the ACTUAL line by which plan band it is in.
 *
 * Three zones (260801): below NEEDS, between needs and needs+wants, and above the
 * whole plan. The line itself is drawn per zone and clipped to the plan regions
 * (see plan-zone-paths) — these are the pure pieces behind it: which zone a point
 * is in, and the sampler that traces the SAME shape the chart draws.
 */
import { describe, it, expect } from "vitest";
import {
  sampleSeries,
  spendZone,
  isOverPlan,
} from "../../src/lib/actual-over-plan";

const row = (real: number, needs: number, wants = 0) => ({
  real,
  needs,
  wants,
});

describe("spendZone", () => {
  it("is 'under' up to and including the needs line", () => {
    expect(spendZone(row(300, 500, 200))).toBe("under");
    expect(spendZone(row(500, 500, 200))).toBe("under");
  });

  it("is 'between' past needs but within needs + wants", () => {
    expect(spendZone(row(501, 500, 200))).toBe("between");
    expect(spendZone(row(700, 500, 200))).toBe("between");
  });

  it("is 'over' past the whole plan", () => {
    expect(spendZone(row(701, 500, 200))).toBe("over");
  });

  it("has no middle zone when there are no wants", () => {
    expect(spendZone(row(600, 500, 0))).toBe("over");
  });

  it("isOverPlan still answers the past-the-whole-plan question", () => {
    expect(isOverPlan(row(700, 500, 200))).toBe(false);
    expect(isOverPlan(row(701, 500, 200))).toBe(true);
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
