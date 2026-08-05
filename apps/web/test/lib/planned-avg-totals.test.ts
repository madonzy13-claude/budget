/**
 * planned-avg-totals.test.ts — the figures under "How far off plan, by category".
 *
 * That chart draws each category's AVERAGE month, so the summary under it has to
 * be the average month too: what a typical month plans, what it actually spends,
 * and the gap. Summed across the categories on show — a mean of the per-category
 * means would answer "how big is a typical category", which nobody asked.
 */
import { describe, it, expect } from "vitest";
import { plannedAvgTotals } from "@/lib/planned-avg-totals";

const rows = [
  { planned_avg_cents: "100000", real_avg_cents: "120000" },
  { planned_avg_cents: "50000", real_avg_cents: "30000" },
];

describe("plannedAvgTotals", () => {
  it("adds the categories into one average month", () => {
    const t = plannedAvgTotals(rows);
    expect(t.plannedCents).toBe(150000);
    expect(t.realCents).toBe(150000);
  });

  it("reads the gap the way the bars do — over plan is positive", () => {
    const t = plannedAvgTotals([
      { planned_avg_cents: "100000", real_avg_cents: "130000" },
    ]);
    expect(t.diffCents).toBe(30000);
    expect(t.pct).toBe(30);
  });

  it("reads under plan as negative", () => {
    const t = plannedAvgTotals([
      { planned_avg_cents: "100000", real_avg_cents: "75000" },
    ]);
    expect(t.diffCents).toBe(-25000);
    expect(t.pct).toBe(-25);
  });

  // Spending against no plan at all has no percentage — there is nothing to be
  // a percentage OF, and 0 would read as "on plan".
  it("has no percent when nothing was planned", () => {
    const t = plannedAvgTotals([
      { planned_avg_cents: "0", real_avg_cents: "4000" },
    ]);
    expect(t.pct).toBeNull();
    expect(t.diffCents).toBe(4000);
  });

  it("survives an empty chart", () => {
    expect(plannedAvgTotals([])).toEqual({
      plannedCents: 0,
      realCents: 0,
      diffCents: 0,
      pct: null,
    });
  });

  it("treats a missing figure as nothing rather than NaN", () => {
    const t = plannedAvgTotals([
      { planned_avg_cents: "", real_avg_cents: "1000" },
    ]);
    expect(t.plannedCents).toBe(0);
    expect(t.realCents).toBe(1000);
  });
});
