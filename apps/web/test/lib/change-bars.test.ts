/**
 * change-bars.test.ts — the "Average change" mean. The bars themselves are
 * built and tested in lib/investment-return.
 */
import { describe, it, expect } from "vitest";
import { geoMean } from "../../src/lib/change-bars";

describe("geoMean", () => {
  it("compounds: +10% and +21% average to the rate that chains to both", () => {
    expect(geoMean([10, 21])).toBeCloseTo((Math.sqrt(1.1 * 1.21) - 1) * 100, 9);
  });

  it("ignores missing periods", () => {
    expect(geoMean([null, 10])).toBeCloseTo(10, 9);
    expect(geoMean([null])).toBeNull();
  });

  it("a −100% or worse period leaves the mean undefined", () => {
    expect(geoMean([-150, 10])).toBeNull();
  });
});
