/**
 * plan-ring.test.ts — the outer ring of the planned-spend pie (260803 request).
 *
 * Two arcs summed across every category in view: what the plan calls needs
 * and what it calls wants. A category is usually part needs and part wants,
 * so it feeds both — which is why the ring is
 * budget-wide totals and does NOT line up with the slices beneath it.
 */
import { describe, it, expect } from "vitest";
import { planRing, planSlices } from "../../src/lib/plan-ring";

const rows = [
  // 300 planned, 250 of it needs → 50 wants
  { category_id: "food", planned_avg_cents: "30000", needs_avg_cents: "25000" },
  // wholly wants
  { category_id: "fun", planned_avg_cents: "10000", needs_avg_cents: "0" },
];

describe("planRing", () => {
  it("sums needs and wants across the categories", () => {
    expect(planRing(rows)).toEqual([
      { key: "needs", value: 25000 },
      { key: "wants", value: 15000 }, // food's 5000 + fun's 10000
    ]);
  });

  it("drops an arc that has nothing in it", () => {
    expect(planRing([rows[1]!]).map((a) => a.key)).toEqual(["wants"]);
  });

  it("survives a row with no needs figure at all", () => {
    // A cached payload from before needs_avg_cents existed: treat it as all
    // wants rather than throwing the chart away.
    const ring = planRing(
      [{ category_id: "x", planned_avg_cents: "20000" }],
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
    );
    expect(ring).toEqual([{ key: "needs", value: 10000 }]);
  });

  it("is empty when nothing is planned", () => {
    expect(planRing([])).toEqual([]);
  });
});

describe("planSlices", () => {
  it("keeps every category, biggest first, dropping empty plans", () => {
    const slices = planSlices([
      { category_id: "a", planned_avg_cents: "100", needs_avg_cents: "0" },
      { category_id: "b", planned_avg_cents: "0", needs_avg_cents: "0" },
      { category_id: "c", planned_avg_cents: "900", needs_avg_cents: "0" },
    ]);
    expect(slices.map((s) => s.category_id)).toEqual(["c", "a"]);
  });
});
