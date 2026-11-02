import { describe, test, it, expect } from "vitest";
import { selectRangeGrowth, rangeInvestMetrics } from "@/lib/wealth-growth";

describe("selectRangeGrowth", () => {
  // grow = first-real → last (non-null %); grow_from_open = opening/$0-edge → last.
  const grow = { delta_cents: "500", delta_pct: 4.2 };
  const grow_from_open = { delta_cents: "1000", delta_pct: null };

  test('"all" anchors on the first real value (grow), not the $0 chart edge', () => {
    // Regression: "all" trims leading zero buckets so the chart starts at the
    // first real snapshot — the % must come from `grow` (non-null), never the
    // pre-trim $0 baseline in grow_from_open (empty % + whole-end-value amount).
    expect(selectRangeGrowth("all", { grow, grow_from_open })).toEqual(grow);
  });

  test("non-all presets use grow_from_open (opening-seeded chart start)", () => {
    expect(selectRangeGrowth("thisMonth", { grow, grow_from_open })).toEqual(
      grow_from_open,
    );
    expect(selectRangeGrowth("last3Months", { grow, grow_from_open })).toEqual(
      grow_from_open,
    );
  });

  test("falls back to grow when grow_from_open is absent (stale cached DTO)", () => {
    expect(selectRangeGrowth("last6Months", { grow })).toEqual(grow);
  });
});

// 261102 (user): the range P/L % is the INVESTMENT RETURN — not profit ÷
// contributions at the start (read +625% for "All"), nor ÷ start + added.
describe("rangeInvestMetrics", () => {
  // 1000 held, +100 (+10%), 10,000 deposited, +1,110 (+10% on 11,100).
  const pts = [
    { label: "d1", value_cents: "1000" },
    { label: "d2", value_cents: "1100" },
    { label: "d3", value_cents: "11100" },
    { label: "d4", value_cents: "12210" },
  ];
  const excl = new Map([
    ["d1", 0],
    ["d2", 100],
    ["d3", 100],
    ["d4", 1210],
  ]);

  it("P/L % is the investment return over the range", () => {
    const m = rangeInvestMetrics(pts, excl)!;
    expect(m.plDelta).toBe(1210);
    expect(m.plPct).toBeCloseTo(21, 9);
  });

  it("contributions and total keep their own bases", () => {
    const m = rangeInvestMetrics(pts, excl)!;
    expect(m.contribDelta).toBe(10000);
    expect(m.contribPct).toBeCloseTo(1000, 9);
    expect(m.totalDelta).toBe(11210);
    expect(m.totalPct).toBeCloseTo(1121, 9);
  });

  it("nothing invested at the start → no %", () => {
    const m = rangeInvestMetrics(
      [
        { label: "a", value_cents: "0" },
        { label: "b", value_cents: "0" },
      ],
      new Map(),
    )!;
    expect(m.plPct).toBeNull();
  });

  it("no points → null", () => {
    expect(rangeInvestMetrics([], new Map())).toBeNull();
  });
});
