import { describe, test, expect } from "vitest";
import { selectRangeGrowth } from "@/lib/wealth-growth";

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
