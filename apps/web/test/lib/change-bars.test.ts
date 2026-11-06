/**
 * change-bars.test.ts — the "Average change" mean. The bars themselves are
 * built and tested in lib/investment-return.
 */
import { describe, it, expect } from "vitest";
import { geoMean, periodShare } from "../../src/lib/change-bars";

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

/**
 * "All" groups the change bars by YEAR, and the first and the running year are
 * partial (user, 261106): counted as whole years they dragged the yearly
 * average down. A year bar counts for the share of it the data covers.
 */
describe("periodShare", () => {
  const ms = (iso: string) => Date.parse(iso);

  it("counts a year the data covers whole as one", () => {
    expect(periodShare("2024", ms("2023-10-01"), ms("2026-07-02"))).toBe(1);
  });

  it("counts the first and the running year for the part covered", () => {
    expect(
      periodShare("2023", ms("2023-10-01T00:00:00Z"), ms("2026-07-02")),
    ).toBeCloseTo(92 / 365, 9);
    expect(
      periodShare("2026", ms("2023-10-01"), ms("2026-07-02T12:00:00Z")),
    ).toBeCloseTo(182.5 / 365, 9);
  });

  it("leaves month and day bars whole", () => {
    expect(periodShare("2026-07", ms("2026-07-20"), ms("2026-07-21"))).toBe(1);
    expect(periodShare("2026-07-20", ms("2026-07-20"), ms("2026-07-20"))).toBe(1);
  });
});

describe("geoMean — weighted by the share of each period", () => {
  it("compounds over the years actually covered", () => {
    const shares = [92 / 365, 1, 1, 182.5 / 365];
    const years = shares.reduce((a, b) => a + b, 0);
    expect(geoMean([10, 10, 10, 10], shares)).toBeCloseTo(
      (Math.pow(1.1 ** 4, 1 / years) - 1) * 100,
      9,
    );
  });

  it("never stretches less than one period of data into a whole one", () => {
    expect(geoMean([5, 10], [62 / 365, 0.5])).toBeCloseTo(15.5, 9);
  });
});
