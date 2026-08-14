/**
 * projectedMonthlyMap — what each category will cost in an average month, for
 * the Future chart.
 *
 * It used to be read off the reserve-fit ROWS, which only exist for categories
 * the buffer tracks. A reserve-excluded one (House, Insurance, Investments on
 * the reporting budget) therefore had no figure, and the chart drew today's
 * limit against itself: "current 779 / expected 779" while the category's two
 * monthly payments came to 798 (user, 260812).
 */
import { describe, it, expect } from "vitest";
import { projectedMonthlyMap } from "../../src/hooks/use-reserve-fit";

describe("projectedMonthlyMap", () => {
  it("covers categories with no reserve row", () => {
    const m = projectedMonthlyMap({
      projected_by_category: [
        { category_id: "insurance", projected_monthly_cents: "79800" },
        { category_id: "food", projected_monthly_cents: "50000" },
      ],
      rows: [{ category_id: "food", projected_monthly_cents: "50000" }],
    });
    expect(m.get("insurance")).toBe(79800);
    expect(m.get("food")).toBe(50000);
  });

  it("falls back to the rows when an older payload has no per-category list", () => {
    const m = projectedMonthlyMap({
      rows: [{ category_id: "food", projected_monthly_cents: "50000" }],
    });
    expect(m.get("food")).toBe(50000);
    expect(m.has("insurance")).toBe(false);
  });

  it("skips a category with no figure rather than inventing one", () => {
    const m = projectedMonthlyMap({
      rows: [
        { category_id: "food", projected_monthly_cents: null },
        { category_id: "car" },
      ],
    });
    expect(m.size).toBe(0);
  });

  it("survives an empty payload", () => {
    expect(projectedMonthlyMap(undefined).size).toBe(0);
  });
});
