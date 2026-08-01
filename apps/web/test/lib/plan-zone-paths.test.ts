/**
 * plan-zone-paths.test.ts — SVG regions for the three plan zones (260801).
 *
 * A gradient can only cut the actual line along a straight boundary (vertical, in
 * our case), so where a limit line is sloped the colour change met it at the wrong
 * angle. Clipping each colour to its zone REGION makes the boundary the limit line
 * itself, whatever its slope.
 *
 * SVG y grows downward: a smaller y is a HIGHER value.
 */
import { describe, it, expect } from "vitest";
import {
  polylineRuns,
  polylinePath,
  regionAbove,
  regionBelow,
  regionBetween,
} from "../../src/lib/plan-zone-paths";

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

describe("regionAbove", () => {
  it("closes the line up to the plot top", () => {
    // …L100,80 then up to the top edge and back along it.
    expect(regionAbove(line, 10)).toBe("M0,100L50,60L100,80L100,10L0,10Z");
  });

  it("is empty for no points", () => {
    expect(regionAbove([], 10)).toBe("");
  });
});

describe("regionBelow", () => {
  it("closes the line down to the plot bottom", () => {
    expect(regionBelow(line, 200)).toBe("M0,100L50,60L100,80L100,200L0,200Z");
  });
});

describe("regionBetween", () => {
  it("walks the upper line forward and the lower line back", () => {
    const upper = [
      { x: 0, y: 40 },
      { x: 100, y: 30 },
    ];
    const lower = [
      { x: 0, y: 100 },
      { x: 100, y: 90 },
    ];
    expect(regionBetween(upper, lower)).toBe("M0,40L100,30L100,90L0,100Z");
  });

  it("is empty when either edge is missing", () => {
    expect(regionBetween([], [{ x: 0, y: 1 }])).toBe("");
    expect(regionBetween([{ x: 0, y: 1 }], [])).toBe("");
  });
});

describe("polylineRuns", () => {
  // The month-boundary DROP is drawn separately, in grey — the zone-coloured
  // copies of the line must skip it or they paint over it (260801 user request).
  it("breaks the path where a segment is skipped", () => {
    const pts = [
      { x: 0, y: 100 },
      { x: 10, y: 50 },
      { x: 20, y: 200 },
      { x: 30, y: 60 },
    ];
    expect(polylineRuns(pts, [false, true, false])).toBe(
      "M0,100L10,50 M20,200L30,60",
    );
  });

  it("is one run when nothing is skipped", () => {
    const pts = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ];
    expect(polylineRuns(pts, [false])).toBe("M0,1L1,2");
  });

  it("drops single leftover points", () => {
    const pts = [
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ];
    expect(polylineRuns(pts, [true])).toBe("");
  });
});
