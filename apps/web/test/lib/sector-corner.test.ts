/**
 * sector-corner.test.ts — why one slice came out with square corners (260804).
 *
 * The pie asks for a 6px corner radius. recharts drops rounding entirely when a
 * sector is too small to fit it, so the moment the minimum-angle floor started
 * producing thin slices, those slices rendered as bare wedges next to rounded
 * neighbours. Shrinking the radius to what the sector can carry keeps every
 * slice in the same visual language.
 */
import { describe, it, expect } from "vitest";
import { sectorCornerRadius } from "../../src/lib/sector-corner";

const geom = (deg: number, inner = 100, outer = 140) => ({
  startAngle: 0,
  endAngle: deg,
  innerRadius: inner,
  outerRadius: outer,
});

describe("sectorCornerRadius", () => {
  it("gives a generous slice the full radius", () => {
    expect(sectorCornerRadius(geom(90), 6)).toBe(6);
  });

  it("shrinks to what a thin slice can carry", () => {
    // 6° of a 100px inner radius is ~10.5px of arc — half of that is the most a
    // corner can take without the two ends overlapping.
    expect(sectorCornerRadius(geom(6), 6)).toBeCloseTo(5.2, 1);
  });

  it("is limited by a narrow band as well as a thin arc", () => {
    expect(sectorCornerRadius(geom(90, 100, 106), 6)).toBe(3);
  });

  it("reads a sector drawn backwards the same way", () => {
    expect(sectorCornerRadius({ ...geom(0), endAngle: -6 }, 6)).toBeCloseTo(
      5.2,
      1,
    );
  });

  it("has nothing to round when the sector has no size", () => {
    expect(sectorCornerRadius(geom(0), 6)).toBe(0);
  });

  it("survives geometry it cannot read", () => {
    expect(
      sectorCornerRadius(
        { startAngle: NaN, endAngle: 10, innerRadius: 100, outerRadius: 140 },
        6,
      ),
    ).toBe(0);
  });
});
