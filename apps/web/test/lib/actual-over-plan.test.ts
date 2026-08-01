/**
 * actual-over-plan.test.ts — colour the ACTUAL line by where it crosses the plan.
 *
 * Chart.js has per-segment styling (`segment.borderColor`), which colours a whole
 * point-to-point segment by its endpoints — the colour then flips a full step
 * early or late. Recharts has no segment API, but an SVG stroke gradient with a
 * HARD STOP at the crossing does better.
 *
 * 260801: the crossing is solved on the SAME monotone cubic recharts draws
 * (`type="monotone"` = d3's curveMonotoneX), not on straight segments — with a
 * curved line the straight-line estimate landed visibly beside the intersection.
 */
import { describe, it, expect } from "vitest";
import {
  overPlanGradientStops,
  isOverPlan,
} from "../../src/lib/actual-over-plan";

const row = (real: number, needs: number, wants = 0) => ({
  real,
  needs,
  wants,
});

const OK = "var(--muted-foreground)";
const OVER = "var(--trading-down)";

describe("isOverPlan", () => {
  it("is false within the plan and on it, true past it", () => {
    expect(isOverPlan(row(400, 500))).toBe(false);
    expect(isOverPlan(row(500, 500))).toBe(false);
    expect(isOverPlan(row(501, 500))).toBe(true);
  });

  it("uses needs + wants as the plan", () => {
    expect(isOverPlan(row(700, 500, 300))).toBe(false);
    expect(isOverPlan(row(900, 500, 300))).toBe(true);
  });
});

describe("overPlanGradientStops", () => {
  it("is one flat colour while spending stays within the plan", () => {
    const stops = overPlanGradientStops(
      [row(100, 500), row(400, 500)],
      OK,
      OVER,
    );
    expect(stops).toEqual([
      { offset: 0, color: OK },
      { offset: 1, color: OK },
    ]);
  });

  it("is one flat colour when the whole line is already over", () => {
    const stops = overPlanGradientStops(
      [row(600, 500), row(900, 500)],
      OK,
      OVER,
    );
    expect(stops).toEqual([
      { offset: 0, color: OVER },
      { offset: 1, color: OVER },
    ]);
  });

  it("cuts at the EXACT crossing, not at the next point", () => {
    // 0 → 1000 across two points, plan flat at 500 → crossing at the midpoint
    // (a 2-point monotone curve IS the straight line, so this stays exact).
    const stops = overPlanGradientStops(
      [row(0, 500), row(1000, 500)],
      OK,
      OVER,
    );
    expect(stops[0]).toEqual({ offset: 0, color: OK });
    expect(stops[1]!.offset).toBeCloseTo(0.5, 6);
    expect(stops[1]!.color).toBe(OK);
    expect(stops[2]!.offset).toBeCloseTo(0.5, 6);
    expect(stops[2]!.color).toBe(OVER);
    expect(stops[stops.length - 1]).toEqual({ offset: 1, color: OVER });
  });

  it("places the cut inside the segment that holds the crossing", () => {
    // 3 points → the middle point sits at offset 0.5, so a crossing in the
    // SECOND segment must land in (0.5, 1). The exact spot follows the drawn
    // monotone curve, which bows away from the straight chord.
    const stops = overPlanGradientStops(
      [row(0, 500), row(400, 500), row(600, 500)],
      OK,
      OVER,
    );
    const cut = stops.find((s) => s.color === OVER)!;
    expect(cut.offset).toBeGreaterThan(0.5);
    expect(cut.offset).toBeLessThan(1);
  });

  it("handles a plan that moves between points", () => {
    const stops = overPlanGradientStops(
      [
        { real: 0, needs: 0, wants: 0 },
        { real: 1000, needs: 500, wants: 0 },
      ],
      OK,
      OVER,
    );
    // real climbs 1000 while the plan climbs 500 → they part at the very start.
    expect(stops[1]!.offset).toBeCloseTo(0, 6);
  });

  it("handles several crossings", () => {
    const stops = overPlanGradientStops(
      [row(0, 500), row(900, 500), row(100, 500), row(900, 500)],
      OK,
      OVER,
    );
    const flips = stops.filter(
      (s, i) => i > 0 && s.color !== stops[i - 1]!.color,
    );
    expect(flips.length).toBeGreaterThanOrEqual(3);
  });

  it("follows the CURVE, not the straight chord, on a bowed series", () => {
    // A monotone spline through these points bows ABOVE the chord between the
    // 2nd and 3rd point, so it reaches the plan EARLIER than a straight line
    // would. The cut must move with the drawn curve.
    const rows = [row(0, 500), row(300, 500), row(700, 500), row(900, 500)];
    const stops = overPlanGradientStops(rows, OK, OVER);
    const cut = stops.find((s) => s.color === OVER)!.offset;
    const chordCut = (1 + (500 - 300) / (700 - 300)) / 3; // linear estimate
    expect(cut).not.toBeCloseTo(chordCut, 4);
    // …and it still lands inside the segment that actually contains the crossing.
    expect(cut).toBeGreaterThan(1 / 3);
    expect(cut).toBeLessThan(2 / 3);
  });

  it("never emits an offset outside 0..1", () => {
    const stops = overPlanGradientStops(
      [row(0, 500), row(1000, 500)],
      OK,
      OVER,
    );
    for (const s of stops) {
      expect(s.offset).toBeGreaterThanOrEqual(0);
      expect(s.offset).toBeLessThanOrEqual(1);
    }
  });

  it("handles a single point and an empty series", () => {
    expect(overPlanGradientStops([row(600, 500)], OK, OVER)).toEqual([
      { offset: 0, color: OVER },
      { offset: 1, color: OVER },
    ]);
    expect(overPlanGradientStops([], OK, OVER)).toEqual([]);
  });
});
