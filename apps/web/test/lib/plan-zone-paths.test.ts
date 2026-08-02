/**
 * plan-zone-paths.test.ts — the drawn line, in SVG (260801).
 *
 * The zone regions are gone with the clipping that needed them; what is left is
 * the polyline the coloured pieces are stroked with.
 */
import { describe, it, expect } from "vitest";
import { holdXsAtBoundary, polylinePath } from "../../src/lib/plan-zone-paths";

const line = [
  { x: 0, y: 100 },
  { x: 50, y: 60 },
  { x: 100, y: 80 },
];

describe("polylinePath", () => {
  it("moves to the first point then lines to the rest", () => {
    expect(polylinePath(line)).toBe("M0,100L50,60L100,80");
  });

  it("is empty for no points", () => {
    expect(polylinePath([])).toBe("");
  });
});

describe("holdXsAtBoundary", () => {
  // A month's last reading is DRAWN at the month end, so the line rises straight
  // into the boundary and the reset falls from where it arrives — no flat stub
  // hanging off the last spending day, and no gap before the fall (260802).
  it("slides the reading before a hold onto the hold's x", () => {
    const rows = [{}, {}, { hold: true }, { drop: true }, {}];
    expect(holdXsAtBoundary(rows, [0, 40, 90, 90, 130])).toEqual([
      0, 90, 90, 90, 130,
    ]);
  });

  it("leaves a run with no hold exactly as it is", () => {
    const xs = [0, 25, 60];
    expect(holdXsAtBoundary([{}, {}, {}], xs)).toEqual(xs);
  });

  it("handles every month in a multi-month range", () => {
    const rows = [{}, { hold: true }, { drop: true }, {}, { hold: true }];
    expect(holdXsAtBoundary(rows, [0, 50, 50, 80, 120])).toEqual([
      50, 50, 50, 120, 120,
    ]);
  });

  it("ignores a hold with nothing before it", () => {
    expect(holdXsAtBoundary([{ hold: true }, {}], [10, 20])).toEqual([10, 20]);
  });
});
