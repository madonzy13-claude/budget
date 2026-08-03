/**
 * plan-ring.test.ts — the outer ring of the planned-spend pie (260803 request).
 *
 * Three arcs summed across every category in view: what the plan calls needs,
 * what it calls wants, and what goes to investing. A category is usually part
 * needs and part wants, so it feeds two arcs — which is why the ring is
 * budget-wide totals and does NOT line up with the slices beneath it.
 */
import { describe, it, expect } from "vitest";
import { planRing, planSlices } from "../../src/lib/plan-ring";

const rows = [
  // 300 planned, 250 of it needs → 50 wants
  { category_id: "food", planned_avg_cents: "30000", needs_avg_cents: "25000" },
  // wholly wants
  { category_id: "fun", planned_avg_cents: "10000", needs_avg_cents: "0" },
  // the investment category — no split of its own
  { category_id: "inv", planned_avg_cents: "50000", needs_avg_cents: "0" },
];
const isInvestment = (id: string) => id === "inv";

describe("planRing", () => {
  it("sums needs, wants and investing across the categories", () => {
    expect(planRing(rows, isInvestment)).toEqual([
      { key: "needs", value: 25000 },
      { key: "wants", value: 15000 }, // food's 5000 + fun's 10000
      { key: "investments", value: 50000 },
    ]);
  });

  it("keeps investing out of the needs/wants split entirely", () => {
    // Its plan has no cushion behind it, so counting it as "wants" would
    // overstate discretionary spending by the whole investment budget.
    const ring = planRing(rows, isInvestment);
    const total = ring.reduce((s, a) => s + a.value, 0);
    expect(total).toBe(30000 + 10000 + 50000);
    expect(ring.find((a) => a.key === "wants")!.value).toBe(15000);
  });

  it("drops an arc that has nothing in it", () => {
    const noInv = planRing(rows.slice(0, 2), isInvestment);
    expect(noInv.map((a) => a.key)).toEqual(["needs", "wants"]);
  });

  it("survives a row with no needs figure at all", () => {
    // A cached payload from before needs_avg_cents existed: treat it as all
    // wants rather than throwing the chart away.
    const ring = planRing(
      [{ category_id: "x", planned_avg_cents: "20000" }],
      () => false,
    );
    expect(ring).toEqual([{ key: "wants", value: 20000 }]);
  });

  it("never lets needs exceed the plan it came from", () => {
    // Defensive: a stale limit could report needs above planned; wants must not
    // go negative and open a reversed arc.
    const ring = planRing(
      [
        {
          category_id: "x",
          planned_avg_cents: "10000",
          needs_avg_cents: "99999",
        },
      ],
      () => false,
    );
    expect(ring).toEqual([{ key: "needs", value: 10000 }]);
  });

  it("is empty when nothing is planned", () => {
    expect(planRing([], isInvestment)).toEqual([]);
  });
});

describe("planSlices", () => {
  // The investment plan already has its own arc on the ring; drawing it as a
  // category slice too showed the same money twice (user, 260803).
  it("leaves the investment category out of the slices", () => {
    const slices = planSlices(rows, isInvestment);
    expect(slices.map((s) => s.category_id)).not.toContain("inv");
  });

  it("keeps every other category, biggest first, dropping empty plans", () => {
    const slices = planSlices(
      [
        { category_id: "a", planned_avg_cents: "100", needs_avg_cents: "0" },
        { category_id: "b", planned_avg_cents: "0", needs_avg_cents: "0" },
        { category_id: "c", planned_avg_cents: "900", needs_avg_cents: "0" },
      ],
      isInvestment,
    );
    expect(slices.map((s) => s.category_id)).toEqual(["c", "a"]);
  });
});
