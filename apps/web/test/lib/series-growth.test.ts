/**
 * series-growth.test.ts — the P/L a capitalization tooltip shows (260804).
 *
 * The investments view already answers "how much has this moved since the range
 * started, in % and in money" on every hovered point. Capitalization — in the
 * budget page and in the all-budgets trend — showed only the absolute value.
 */
import { describe, it, expect } from "vitest";
import { seriesGrowth } from "../../src/lib/series-growth";

describe("seriesGrowth", () => {
  it("measures from the range's first point", () => {
    expect(seriesGrowth(200000, 250000)).toEqual({
      deltaCents: 50000,
      pct: 25,
    });
  });

  it("reports a fall as negative on both counts", () => {
    expect(seriesGrowth(200000, 150000)).toEqual({
      deltaCents: -50000,
      pct: -25,
    });
  });

  it("says nothing when the range starts at zero", () => {
    // No base to be a percentage OF — the tooltip drops the columns entirely
    // rather than printing an infinity.
    expect(seriesGrowth(0, 5000)).toBeNull();
  });

  it("says nothing when the point is unreadable", () => {
    expect(seriesGrowth(1000, Number.NaN)).toBeNull();
  });

  it("is flat at the first point itself", () => {
    expect(seriesGrowth(200000, 200000)).toEqual({ deltaCents: 0, pct: 0 });
  });
});
