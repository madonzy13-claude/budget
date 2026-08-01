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
  spendZone,
  zoneSegments,
  zoneThresholds,
} from "../../src/lib/actual-over-plan";

describe("spendZone", () => {
  // 260801 (user decision): the line is coloured by WHERE THE MONEY CAME FROM.
  // Limit 100, reserve 50, overspend 25 → 175 spent. The five-point floors move
  // the cuts down to 82.5 and 141.25, which is the shrink the user asked for:
  // the tooltip still reports the true 100 / 50 / 25.
  const split = (real: number) => ({
    real,
    needs: 0,
    wants: 0,
    withinLimit: 100,
    reserveUsed: 50,
    overspent: 25,
  });

  it("is 'under' through the green stretch", () => {
    expect(spendZone(split(40))).toBe("under");
    expect(spendZone(split(82))).toBe("under");
  });

  it("is 'between' across the reserve stretch", () => {
    expect(spendZone(split(83))).toBe("between");
    expect(spendZone(split(141))).toBe("between");
  });

  it("is 'over' past both stretches", () => {
    expect(spendZone(split(142))).toBe("over");
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

  it("does not move with a point's own running total", () => {
    // The thresholds describe the MONTH, so every point in it shares them —
    // otherwise the boundary climbs with the line and the line outruns it.
    const month = {
      needs: 0,
      wants: 0,
      withinLimit: 100,
      reserveUsed: 50,
      overspent: 25,
    };
    const early = zoneThresholds({ real: 20, ...month });
    const late = zoneThresholds({ real: 175, ...month });
    expect(early).toEqual(late);
  });

  it("is all zero for a point with no spend", () => {
    const t = zoneThresholds({ real: 0, needs: 0, wants: 0 });
    expect(t).toEqual({ limit: 0, covered: 0 });
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

  it("does not move with a point's own running total", () => {
    // The thresholds describe the MONTH, so every point in it shares them —
    // otherwise the boundary climbs with the line and the line outruns it.
    const month = {
      needs: 0,
      wants: 0,
      withinLimit: 100,
      reserveUsed: 50,
      overspent: 25,
    };
    const early = zoneThresholds({ real: 20, ...month });
    const late = zoneThresholds({ real: 175, ...month });
    expect(early).toEqual(late);
  });

  it("is all zero for a point with no spend", () => {
    const t = zoneThresholds({ real: 0, needs: 0, wants: 0 });
    expect(t).toEqual({ limit: 0, covered: 0 });
  });
});

describe("zoneSegments", () => {
  // A month that spent 100 of its limit, 50 of reserve and 25 over: with the
  // 5-point floors green ends at 82.5 and yellow at 141.25.
  const month = {
    needs: 0,
    wants: 0,
    withinLimit: 100,
    reserveUsed: 50,
    overspent: 25,
  };
  const row = (real: number, extra: Record<string, unknown> = {}) => ({
    real,
    ...month,
    ...extra,
  });

  it("leaves a segment inside one zone whole", () => {
    const segs = zoneSegments([row(0), row(40)]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.zone).toBe("under");
    expect(segs[0]!.points).toEqual([
      { x: 0, v: 0 },
      { x: 1, v: 40 },
    ]);
  });

  it("cuts a segment AT the crossing, so each piece is one colour", () => {
    const segs = zoneSegments([row(0), row(120)]);
    expect(segs.map((s) => s.zone)).toEqual(["under", "between"]);
    // 82.5 of a 0→120 climb — the cut lands where the line really crosses.
    expect(segs[0]!.points[1]!.v).toBeCloseTo(82.5, 6);
    expect(segs[0]!.points[1]!.x).toBeCloseTo(82.5 / 120, 6);
    expect(segs[1]!.points[0]!).toEqual(segs[0]!.points[1]!);
  });

  it("cuts twice when a segment climbs through both zones", () => {
    const segs = zoneSegments([row(0), row(175)]);
    expect(segs.map((s) => s.zone)).toEqual(["under", "between", "over"]);
    expect(segs[1]!.points[1]!.v).toBeCloseTo(141.25, 6);
  });

  it("cuts a FALLING segment in the order it is travelled", () => {
    const segs = zoneSegments([row(175), row(0)]);
    expect(segs.map((s) => s.zone)).toEqual(["over", "between", "under"]);
  });

  it("skips the month reset — that vertical is drawn in grey", () => {
    const segs = zoneSegments([row(120), row(0, { drop: true }), row(30)]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.points).toEqual([
      { x: 1, v: 0 },
      { x: 2, v: 30 },
    ]);
  });
});
