/**
 * actual-over-plan.test.ts — colour the ACTUAL line by which plan band it is in.
 *
 * Three zones (260801): below NEEDS, between needs and needs+wants, and above the
 * whole plan. Chart.js would do this with per-segment styling, which flips colour
 * at a data point; here the line is one stroke with a hard-stop gradient cut at
 * the real crossings, solved on the same monotone cubic recharts draws.
 */
import { describe, it, expect } from "vitest";
import {
  planZoneGradientStops,
  spendZone,
  isOverPlan,
} from "../../src/lib/actual-over-plan";

const row = (real: number, needs: number, wants = 0) => ({
  real,
  needs,
  wants,
});

const UNDER = "green";
const BETWEEN = "yellow";
const OVER = "red";
const COLORS = { under: UNDER, between: BETWEEN, over: OVER };

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

describe("planZoneGradientStops", () => {
  it("is one flat colour while the line stays in a single zone", () => {
    expect(
      planZoneGradientStops([row(100, 500, 200), row(400, 500, 200)], COLORS),
    ).toEqual([
      { offset: 0, color: UNDER },
      { offset: 1, color: UNDER },
    ]);
  });

  it("cuts at the needs line when the line climbs into the wants band", () => {
    const stops = planZoneGradientStops(
      [row(0, 500, 200), row(600, 500, 200)],
      COLORS,
    );
    expect(stops[0]!.color).toBe(UNDER);
    expect(stops[stops.length - 1]!.color).toBe(BETWEEN);
    // Hard edge: two stops share the offset, at the 500/600 crossing.
    expect(stops[1]!.offset).toBeCloseTo(stops[2]!.offset, 9);
    expect(stops[1]!.offset).toBeCloseTo(500 / 600, 2);
  });

  it("passes through BOTH cuts when one segment spans all three zones", () => {
    const stops = planZoneGradientStops(
      [row(0, 500, 200), row(1000, 500, 200)],
      COLORS,
    );
    const colors = stops.map((s) => s.color);
    expect(colors[0]).toBe(UNDER);
    expect(colors).toContain(BETWEEN);
    expect(colors[colors.length - 1]).toBe(OVER);
    const firstBetween = stops.findIndex((s) => s.color === BETWEEN);
    const firstOver = stops.findIndex((s) => s.color === OVER);
    expect(firstBetween).toBeLessThan(firstOver);
  });

  it("colours the way back down too", () => {
    const stops = planZoneGradientStops(
      [row(900, 500, 200), row(100, 500, 200)],
      COLORS,
    );
    expect(stops[0]!.color).toBe(OVER);
    expect(stops[stops.length - 1]!.color).toBe(UNDER);
  });

  it("keeps offsets inside 0..1 and in ascending order", () => {
    const stops = planZoneGradientStops(
      [row(0, 500, 200), row(1000, 500, 200), row(300, 500, 200)],
      COLORS,
    );
    for (const s of stops) {
      expect(s.offset).toBeGreaterThanOrEqual(0);
      expect(s.offset).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]!.offset).toBeGreaterThanOrEqual(stops[i - 1]!.offset);
    }
  });

  it("follows the drawn CURVE, not the straight chord", () => {
    const rows = [
      row(0, 500, 0),
      row(300, 500, 0),
      row(700, 500, 0),
      row(900, 500, 0),
    ];
    const stops = planZoneGradientStops(rows, COLORS);
    const cut = stops.find((s) => s.color === OVER)!.offset;
    const chordCut = (1 + (500 - 300) / (700 - 300)) / 3;
    expect(cut).not.toBeCloseTo(chordCut, 4);
    expect(cut).toBeGreaterThan(1 / 3);
    expect(cut).toBeLessThan(2 / 3);
  });

  it("handles a single point and an empty series", () => {
    expect(planZoneGradientStops([row(900, 500, 200)], COLORS)).toEqual([
      { offset: 0, color: OVER },
      { offset: 1, color: OVER },
    ]);
    expect(planZoneGradientStops([], COLORS)).toEqual([]);
  });
});
