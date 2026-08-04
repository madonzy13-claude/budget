/**
 * reserve-fit-rows.test.ts — turning the API rows into what the chart draws.
 *
 * The bar is a signed percent like "How far off plan", but the interesting cases
 * are the ones a percent cannot express: a category that needs nothing while
 * holding money (no denominator), and a category with too little history to
 * judge at all.
 */
import { describe, it, expect } from "vitest";
import { reserveFitRows, MIN_MONTHS } from "../../src/lib/reserve-fit-rows";
import type { ReserveFitRow } from "../../src/hooks/use-reserve-fit";

const row = (over: Partial<ReserveFitRow> = {}): ReserveFitRow => ({
  category_id: "c1",
  name: "Food",
  held_cents: "5000",
  needed_cents: "10000",
  gap_cents: "-5000",
  worst_month: "2026-02",
  worst_overage_cents: "12000",
  overage_months: 2,
  months_counted: 12,
  large_transactions: [],
  ...over,
});

describe("reserveFitRows", () => {
  it("reads a short category as a negative percent of what it needs", () => {
    const [r] = reserveFitRows([row()]).sized;
    expect(r?.pct).toBe(-50); // holds 50, needs 100
    expect(r?.short).toBe(true);
  });

  it("reads an over-held category as a positive percent", () => {
    const [r] = reserveFitRows([
      row({ held_cents: "15000", needed_cents: "10000", gap_cents: "5000" }),
    ]).sized;
    expect(r?.pct).toBe(50);
    expect(r?.short).toBe(false);
  });

  it("calls a category that needs NOTHING but holds money fully over", () => {
    // No denominator to divide by: every zloty of it is trimmable.
    const [r] = reserveFitRows([
      row({ held_cents: "46000", needed_cents: "0", gap_cents: "46000" }),
    ]).sized;
    expect(r?.pct).toBe(100);
  });

  it("calls a category that needs nothing and holds nothing settled", () => {
    const [r] = reserveFitRows([
      row({ held_cents: "0", needed_cents: "0", gap_cents: "0" }),
    ]).sized;
    expect(r?.pct).toBe(0);
  });

  it("sets a barely-used category aside when its siblings have real history", () => {
    const { sized, thin } = reserveFitRows([
      row({ months_counted: MIN_MONTHS - 1 }),
      row({ category_id: "c2", name: "Car" }),
    ]);
    expect(sized.map((r) => r.name)).toEqual(["Car"]);
    expect(thin.map((r) => r.name)).toEqual(["Food"]);
  });

  // 260804: the chart is offered on a 1M range too. One month is a weak signal,
  // but it IS the signal the member asked to see — setting every row aside as
  // "not enough history" would leave an empty chart on every short range.
  it("sizes everything when the range itself is short", () => {
    const { sized, thin } = reserveFitRows([
      row({ months_counted: 1 }),
      row({ category_id: "c2", name: "Car", months_counted: 1 }),
    ]);
    expect(sized.map((r) => r.name)).toEqual(["Food", "Car"]);
    expect(thin).toEqual([]);
  });

  it("puts the categories that need money first, then the fattest reserves", () => {
    const { sized } = reserveFitRows([
      row({ category_id: "a", name: "A", gap_cents: "5000" }),
      row({ category_id: "b", name: "B", gap_cents: "-9000" }),
      row({ category_id: "c", name: "C", gap_cents: "20000" }),
    ]);
    expect(sized.map((r) => r.name)).toEqual(["B", "C", "A"]);
  });

  it("survives a cached row from before the one-off list existed", () => {
    const stale = { ...row() } as Partial<ReserveFitRow>;
    delete stale.large_transactions;
    const { sized } = reserveFitRows([stale as ReserveFitRow]);
    expect(sized[0]?.candidates).toEqual([]);
  });
});
