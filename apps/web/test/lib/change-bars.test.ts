/**
 * change-bars.test.ts — the investments "Average change" bars (Contributions ·
 * P/L · Total), shared by the budget Overview and the all-budgets trend.
 *
 * P/L used to be ΔP/L ÷ P/L-at-start — how fast the PROFIT grew, not a return.
 * Private Budget 2024: profit 43,730 → 250,063 on ~498k invested drew +472%.
 * A period's P/L % is now ΔP/L ÷ value at the period's start.
 */
import { describe, it, expect } from "vitest";
import { combineChangeBars } from "../../src/lib/change-bars";

// 2024 of Private Budget: value 498,195 → 723,193, profit 43,730 → 250,063.
const total = [{ label: "2024", pct: (224998 * 100) / 498195, delta: 224998 }];
const pl = [{ label: "2024", pct: (206333 * 100) / 43730, delta: 206333 }];

describe("combineChangeBars", () => {
  it("reads P/L as a return on the value the period started with", () => {
    const { rows } = combineChangeBars(total, pl);
    expect(rows[0]!.pl).toBeCloseTo((206333 * 100) / 498195, 6); // +41.4%
    expect(rows[0]!.plDelta).toBe(206333);
  });

  it("keeps Total and Contributions on their own bases", () => {
    const { rows } = combineChangeBars(total, pl);
    expect(rows[0]!.total).toBeCloseTo(total[0]!.pct, 6);
    // contributions 454,465 → 473,130
    expect(rows[0]!.contribDelta).toBe(18665);
    expect(rows[0]!.contrib).toBeCloseTo((18665 * 100) / 454465, 4);
  });

  it("averages the P/L bars it draws, geometrically", () => {
    const t = [
      { label: "a", pct: 10, delta: 100 },
      { label: "b", pct: 10, delta: 110 },
    ];
    const p = [
      { label: "a", pct: 50, delta: 50 }, // start value 1000 → +5%
      { label: "b", pct: 20, delta: 22 }, // start value 1100 → +2%
    ];
    const { rows, avg } = combineChangeBars(t, p);
    expect(rows.map((r) => r.pl)).toEqual([5, 2]);
    expect(avg.pl).toBeCloseTo((Math.sqrt(1.05 * 1.02) - 1) * 100, 6);
    expect(avg.total).toBeCloseTo(10, 6);
  });

  it("leaves P/L at 0 when the period has no starting value", () => {
    const { rows, avg } = combineChangeBars(
      [{ label: "a", pct: null, delta: 500 }],
      [{ label: "a", pct: null, delta: 20 }],
    );
    expect(rows[0]!.pl).toBe(0);
    expect(avg.pl).toBeNull();
  });
});
