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

// 261102 (user: "p/l isn't calculated correctly in financial wealth"). The
// range P/L % divided by the contributions at the range START, so a long range
// that began small read absurdly: All on Private Budget = 464k profit over a
// 74k Nov-2022 start = +625%. It is now a return on the money at work over the
// range: start value + what was added (= end value − profit gained).
describe("rangeInvestMetrics", () => {
  const pts = [
    { label: "2022-11-01", value_cents: "7150840" },
    { label: "2026-11-02", value_cents: "101946700" },
  ];
  const excl = new Map([
    ["2022-11-01", -279196],
    ["2026-11-02", 46179900],
  ]);

  it("P/L % is profit gained over start value + contributions added", () => {
    const m = rangeInvestMetrics(pts, excl)!;
    expect(m.plDelta).toBe(46459096);
    // 46,459,096 ÷ (101,946,700 − 46,459,096)
    expect(m.plPct).toBeCloseTo(83.73, 1);
  });

  it("contributions and total keep their own bases", () => {
    const m = rangeInvestMetrics(pts, excl)!;
    expect(m.contribDelta).toBe(101946700 - 46179900 - (7150840 + 279196));
    expect(m.totalDelta).toBe(101946700 - 7150840);
    expect(m.totalPct).toBeCloseTo((100 * (101946700 - 7150840)) / 7150840, 6);
  });

  it("no money at work → no %", () => {
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
