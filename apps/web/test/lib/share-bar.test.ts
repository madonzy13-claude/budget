/**
 * share-bar.test.ts — turning amounts into the widths of a stacked bar.
 *
 * Two Overview strips became bars (user, 260804): the spend breakdown (what the
 * limit covered / what the reserve covered / what was overspent) and the reserve
 * fit (needed vs held). Both need the same thing — proportional widths that
 * still leave a tiny slice visible enough to hover.
 */
import { describe, it, expect } from "vitest";
import { shareBarWidths, MIN_SEGMENT_PCT } from "../../src/lib/share-bar";

describe("shareBarWidths", () => {
  it("splits the bar in proportion", () => {
    expect(shareBarWidths([50, 30, 20])).toEqual([50, 30, 20]);
  });

  it("drops a zero segment entirely rather than drawing a sliver", () => {
    const w = shareBarWidths([100, 0, 100]);
    expect(w[1]).toBe(0);
    expect(w[0]).toBe(50);
  });

  it("keeps a tiny segment wide enough to touch", () => {
    const w = shareBarWidths([9999, 1]);
    expect(w[1]).toBeGreaterThanOrEqual(MIN_SEGMENT_PCT);
  });

  it("still adds up to the whole bar", () => {
    for (const values of [
      [9999, 1],
      [50, 30, 20],
      [1, 1, 1],
      [700, 200, 3],
    ]) {
      const total = shareBarWidths(values).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(100, 6);
    }
  });

  it("has nothing to draw when every value is zero", () => {
    expect(shareBarWidths([0, 0])).toEqual([0, 0]);
  });

  it("ignores a value it cannot read", () => {
    expect(shareBarWidths([100, Number.NaN])).toEqual([100, 0]);
  });

  it("treats a negative value as nothing", () => {
    expect(shareBarWidths([100, -50])).toEqual([100, 0]);
  });
});
