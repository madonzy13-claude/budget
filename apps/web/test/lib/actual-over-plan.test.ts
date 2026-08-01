/**
 * actual-over-plan.test.ts — colour the ACTUAL line by which plan band it is in.
 *
 * Three zones (260801): the stretch of a month's spend its LIMIT covered, the
 * stretch its RESERVE covered, and the overspend. The line is drawn per zone and
 * clipped to those regions (see plan-zone-paths) — these are the pure pieces
 * behind it: the display thresholds, which zone a point is in, and the sampler
 * that traces the SAME shape the chart draws.
 */
import { describe, it, expect } from "vitest";
import {
  sampleSeries,
  spendZone,
  zoneThresholds,
} from "../../src/lib/actual-over-plan";

describe("spendZone", () => {
  // 260801 (user decision): the line is coloured by WHERE THE MONEY CAME FROM.
  // Limit 100, reserve 50, overspend 25 → 175 spent. A point's zone flips at the
  // TRUE amounts it has reached (100, then 150) — the floors only stretch how
  // much of the LINE each colour covers, never when the colour starts.
  const split = (real: number) => ({
    real,
    needs: 0,
    wants: 0,
    withinLimit: 100,
    reserveUsed: 50,
    overspent: 25,
  });

  it("is 'under' until the limit is actually used up", () => {
    expect(spendZone(split(40))).toBe("under");
    expect(spendZone(split(100))).toBe("under");
  });

  it("is 'between' while the reserve is being drawn", () => {
    expect(spendZone(split(101))).toBe("between");
    expect(spendZone(split(150))).toBe("between");
  });

  it("is 'over' past the limit and the reserve together", () => {
    expect(spendZone(split(151))).toBe("over");
    expect(spendZone(split(175))).toBe("over");
  });

  it("has no middle zone when no reserve was drawn", () => {
    expect(spendZone({ ...split(120), reserveUsed: 0, overspent: 25 })).toBe(
      "over",
    );
  });
});

describe("zoneThresholds", () => {
  // 260801 (user decision): a reserve draw or an overspend that exists AT ALL
  // gets a 5-point floor added to its share, taken out of green — a 3% sliver is
  // invisible on a line, and those are exactly the jumps worth seeing.
  it("adds five points to a part that exists, taking them from green", () => {
    const t = zoneThresholds({
      real: 100,
      needs: 0,
      wants: 0,
      withinLimit: 97,
      reserveUsed: 3,
      overspent: 0,
    });
    // 3% reserve becomes 8%: green ends at 92, the reserve stretch at 100.
    expect(t.limit).toBeCloseTo(92, 6);
    expect(t.covered).toBeCloseTo(100, 6);
  });

  it("boosts both parts when both exist", () => {
    const t = zoneThresholds({
      real: 100,
      needs: 0,
      wants: 0,
      withinLimit: 90,
      reserveUsed: 5,
      overspent: 5,
    });
    // reserve 5% + 5 = 10, overspend 5% + 5 = 10, green 80.
    expect(t.limit).toBeCloseTo(80, 6);
    expect(t.covered).toBeCloseTo(90, 6);
  });

  it("leaves a month that only used its limit entirely green", () => {
    const t = zoneThresholds({
      real: 100,
      needs: 0,
      wants: 0,
      withinLimit: 100,
      reserveUsed: 0,
      overspent: 0,
    });
    expect(t.limit).toBeCloseTo(100, 6);
    expect(t.covered).toBeCloseTo(100, 6);
  });

  it("never lets the boosts push green below zero", () => {
    const t = zoneThresholds({
      real: 100,
      needs: 0,
      wants: 0,
      withinLimit: 0,
      reserveUsed: 50,
      overspent: 50,
    });
    expect(t.limit).toBeGreaterThanOrEqual(0);
    expect(t.limit).toBeLessThanOrEqual(t.covered);
    expect(t.covered).toBeLessThanOrEqual(100);
  });

  it("shows no reserve stretch before the reserve was actually drawn", () => {
    // Mid-month the line has only spent part of its limit: the month may end up
    // drawing reserve, but at THIS point none has been (user report — the line
    // went yellow while the tooltip still read 0 reserve used).
    const t = zoneThresholds({
      real: 60,
      needs: 0,
      wants: 0,
      withinLimit: 100,
      reserveUsed: 50,
      overspent: 25,
    });
    expect(t.limit).toBeCloseTo(60, 6);
    expect(t.covered).toBeCloseTo(60, 6);
  });

  it("opens the reserve stretch as soon as the limit is passed", () => {
    const t = zoneThresholds({
      real: 110,
      needs: 0,
      wants: 0,
      withinLimit: 100,
      reserveUsed: 50,
      overspent: 25,
    });
    // 10 of 110 drawn from reserve, floored up — and nothing overspent yet.
    expect(t.limit).toBeLessThan(100);
    expect(t.covered).toBeCloseTo(110, 6);
  });

  it("is all zero for a point with no spend", () => {
    const t = zoneThresholds({ real: 0, needs: 0, wants: 0 });
    expect(t).toEqual({ limit: 0, covered: 0 });
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
