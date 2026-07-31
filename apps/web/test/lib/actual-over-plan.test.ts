/**
 * actual-over-plan.test.ts — colour the ACTUAL line by where it crosses the plan.
 *
 * Chart.js has per-segment styling (`segment.borderColor`), which colours a whole
 * point-to-point segment by its endpoints — the colour then flips a full step
 * early or late. Recharts has no segment API, but an SVG stroke gradient with a
 * HARD STOP at the interpolated crossing does better: the colour changes exactly
 * where actual meets needs+wants, whatever the point density (260731 round 3).
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
    // 0 → 1000 across two points, plan flat at 500 → crossing at the midpoint.
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

  it("places the cut proportionally inside a longer series", () => {
    // 3 points → the middle point sits at offset 0.5; the crossing happens
    // halfway through the SECOND segment → offset 0.75.
    const stops = overPlanGradientStops(
      [row(0, 500), row(400, 500), row(600, 500)],
      OK,
      OVER,
    );
    const cut = stops.find((s) => s.color === OVER)!;
    expect(cut.offset).toBeCloseTo(0.75, 6);
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
