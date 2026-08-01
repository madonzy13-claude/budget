/**
 * plan-zone-paths.test.ts — the drawn line, in SVG (260801).
 *
 * The zone regions are gone with the clipping that needed them; what is left is
 * the polyline the coloured pieces are stroked with.
 */
import { describe, it, expect } from "vitest";
import { polylinePath } from "../../src/lib/plan-zone-paths";

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
