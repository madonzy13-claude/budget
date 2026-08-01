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

const row = (real: number, needs: number, wants = 0, reserve = 0) => ({
  real,
  needs,
  wants,
  reserve,
});

describe("spendZone", () => {
  // 260801 (user decision): green while the spend is inside the PLAN, yellow
  // while it is covered by that month's reserve, red once both are gone.
  it("is 'under' up to and including the plan", () => {
    expect(spendZone(row(300, 500, 200, 400))).toBe("under");
    expect(spendZone(row(700, 500, 200, 400))).toBe("under");
  });

  it("is 'between' while the reserve is covering it", () => {
    expect(spendZone(row(701, 500, 200, 400))).toBe("between");
    expect(spendZone(row(1100, 500, 200, 400))).toBe("between");
  });

  it("is 'over' once the reserve is spent too", () => {
    expect(spendZone(row(1101, 500, 200, 400))).toBe("over");
  });

  it("has no middle zone when there is no reserve", () => {
    expect(spendZone(row(701, 500, 200, 0))).toBe("over");
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
