/**
 * investment-grouping.test.ts — pure helpers for the interleaved, sortable
 * group model (Phase 9 group redesign).
 *
 * Model: the top-level list interleaves GROUP blocks and LOOSE holdings, ordered
 * by each entry's representative sortOrder (a group = min sortOrder of its
 * members). Dragging a group moves the whole block; dragging a child reorders it
 * within its group or moves it across groups / out to loose.
 */
import { describe, it, expect } from "vitest";
import type { HoldingDto } from "../../src/hooks/use-investments";
import {
  buildInvestmentEntries,
  groupAggregate,
  resolveDragEnd,
  resolveHoldingDrop,
} from "../../src/lib/investment-grouping";

function h(over: Partial<HoldingDto> & { id: string }): HoldingDto {
  return {
    name: over.id,
    holdingType: "other",
    uiType: "other",
    group: null,
    instrumentId: null,
    metal: null,
    metalKind: null,
    unitOfMeasure: null,
    premiumPct: null,
    symbol: null,
    instrumentProvider: null,
    isCustom: true,
    isDelisted: false,
    quantity: "1",
    buyPriceCents: null,
    buyCurrency: "USD",
    currentPriceCents: "0",
    currentPriceCurrency: "USD",
    valueCents: "0",
    valueInBudgetCents: "0",
    profitLossPct: null,
    profitLossCents: null,
    weightPct: 0,
    sortOrder: 0,
    createdAt: "2026-06-21T00:00:00Z",
    ...over,
  };
}

// Layout: [A(g=Brokerage,0), B(g=Brokerage,1), C(loose,2), D(g=Metals,3), E(loose,4)]
function sample(): HoldingDto[] {
  return [
    h({ id: "A", group: "Brokerage", sortOrder: 0 }),
    h({ id: "B", group: "Brokerage", sortOrder: 1 }),
    h({ id: "C", group: null, sortOrder: 2 }),
    h({ id: "D", group: "Metals", sortOrder: 3 }),
    h({ id: "E", group: null, sortOrder: 4 }),
  ];
}

describe("buildInvestmentEntries", () => {
  it("interleaves group blocks and loose rows by representative order", () => {
    const entries = buildInvestmentEntries(sample());
    expect(
      entries.map((e) => (e.kind === "group" ? `g:${e.name}` : e.holding.id)),
    ).toEqual(["g:Brokerage", "C", "g:Metals", "E"]);
  });

  it("keeps one contiguous block per group with children in sortOrder", () => {
    const entries = buildInvestmentEntries(sample());
    const brokerage = entries.find(
      (e) => e.kind === "group" && e.name === "Brokerage",
    );
    expect(brokerage?.kind).toBe("group");
    if (brokerage?.kind === "group")
      expect(brokerage.holdings.map((x) => x.id)).toEqual(["A", "B"]);
  });
});

describe("groupAggregate", () => {
  it("sums value in budget cents across children", () => {
    const agg = groupAggregate([
      h({ id: "A", valueInBudgetCents: "100000", profitLossPct: 25 }),
      h({ id: "B", valueInBudgetCents: "300000", profitLossPct: 50 }),
    ]);
    expect(agg.valueBudgetCents).toBe(400000);
  });

  it("computes a cost-basis blended P/L% over children that have a basis", () => {
    // A: value 100k, +25% → cost 80k. B: value 300k, +50% → cost 200k.
    // blended = (400k - 280k)/280k = 42.857%
    const agg = groupAggregate([
      h({ id: "A", valueInBudgetCents: "100000", profitLossPct: 25 }),
      h({ id: "B", valueInBudgetCents: "300000", profitLossPct: 50 }),
    ]);
    expect(agg.plPct).toBeCloseTo(42.857, 2);
  });

  it("ignores no-basis (cash) children in the P/L but counts their value", () => {
    const agg = groupAggregate([
      h({ id: "A", valueInBudgetCents: "100000", profitLossPct: 20 }),
      h({ id: "Cash", valueInBudgetCents: "50000", profitLossPct: null }),
    ]);
    expect(agg.valueBudgetCents).toBe(150000);
    // only A has basis: cost = 100k/1.2 = 83.33k → (100k-83.33k)/83.33k = 20%
    expect(agg.plPct).toBeCloseTo(20, 2);
  });

  it("returns null P/L when no child has a basis", () => {
    const agg = groupAggregate([h({ id: "Cash", profitLossPct: null })]);
    expect(agg.plPct).toBeNull();
  });
});

describe("resolveDragEnd", () => {
  it("moves a whole group block when dragging the group, no group change", () => {
    // drag g:Metals onto g:Brokerage → Metals block lands before Brokerage
    const r = resolveDragEnd(sample(), "group:Metals", "group:Brokerage");
    expect(r).not.toBeNull();
    expect(r!.groupChange).toBeUndefined();
    // D (Metals) now first, then Brokerage block A,B, then C, then E
    expect(r!.orderedIds).toEqual(["D", "A", "B", "C", "E"]);
  });

  it("reassigns a loose holding dropped on a group header into that group (top)", () => {
    const r = resolveDragEnd(sample(), "C", "group:Brokerage");
    expect(r).not.toBeNull();
    expect(r!.groupChange).toEqual({ holdingId: "C", group: "Brokerage" });
    // C joins the TOP of the Brokerage block: C,A,B then Metals D then E
    expect(r!.orderedIds).toEqual(["C", "A", "B", "D", "E"]);
  });

  it("moves a child out to loose when dropped on a loose row (arrayMove)", () => {
    // drag B (Brokerage) onto E (loose) → B becomes loose, lands at E's slot
    const r = resolveDragEnd(sample(), "B", "E");
    expect(r).not.toBeNull();
    expect(r!.groupChange).toEqual({ holdingId: "B", group: null });
    // A stays in Brokerage; B lands where E was (down-drag arrayMove)
    expect(r!.orderedIds).toEqual(["A", "C", "D", "E", "B"]);
  });

  it("reorders a child within its own group, dragging UP (arrayMove)", () => {
    // drag B onto A within Brokerage → B lands at A's slot (before A)
    const r = resolveDragEnd(sample(), "B", "A");
    expect(r).not.toBeNull();
    expect(r!.groupChange).toBeUndefined();
    expect(r!.orderedIds).toEqual(["B", "A", "C", "D", "E"]);
  });

  it("reorders dragging DOWN lands AFTER the target (no move-back)", () => {
    // drag A onto B (down) → A lands after B
    const r = resolveDragEnd(sample(), "A", "B");
    expect(r).not.toBeNull();
    expect(r!.orderedIds).toEqual(["B", "A", "C", "D", "E"]);
  });

  it("returns null for a no-op drop on itself", () => {
    expect(resolveDragEnd(sample(), "A", "A")).toBeNull();
  });

  // UAT #4 (redesign): no more explicit drop zones. Dropping a holding clearly
  // BELOW the trailing group's last member lands it loose at the very end — the
  // section sets `asLooseEnd` when the over row is the last holding and the dragged
  // midpoint is past its bottom edge. This is the only way to ungroup when a single
  // group holds every item (no loose row to drop onto).
  describe("asLooseEnd (drop below the trailing group → loose at the end)", () => {
    it("moves a grouped child out to loose even when it's the only group", () => {
      const onlyGroup = [
        h({ id: "A", group: "G", sortOrder: 0 }),
        h({ id: "B", group: "G", sortOrder: 1 }),
      ];
      const r = resolveDragEnd(onlyGroup, "A", "B", { asLooseEnd: true });
      expect(r).not.toBeNull();
      expect(r!.groupChange).toEqual({ holdingId: "A", group: null });
      // B stays in G; A becomes loose at the end.
      expect(r!.orderedIds).toEqual(["B", "A"]);
    });

    it("ungroups a child from a multi-entry layout, landing it loose at the end", () => {
      const r = resolveDragEnd(sample(), "B", "E", { asLooseEnd: true });
      expect(r!.groupChange).toEqual({ holdingId: "B", group: null });
      expect(r!.orderedIds).toEqual(["A", "C", "D", "E", "B"]);
    });

    it("moves an already-loose middle row to the END (no group change)", () => {
      const r = resolveDragEnd(sample(), "C", "E", { asLooseEnd: true });
      expect(r).not.toBeNull();
      expect(r!.groupChange).toBeUndefined();
      expect(r!.orderedIds).toEqual(["A", "B", "D", "E", "C"]);
    });

    it("is a no-op when the row is already loose AND already last", () => {
      // E is loose and already last → nothing to do.
      expect(
        resolveDragEnd(sample(), "E", "E", { asLooseEnd: true }),
      ).toBeNull();
    });
  });

  // UAT #6: dragging a group DOWN past the last entry — the block must land
  // AFTER the anchor, not before it (which was a no-op → "group can't be last").
  describe("placeAfter (drag a group block downward)", () => {
    it("lands the group block AFTER the anchor row when placeAfter", () => {
      // drag g:Metals down onto E (last loose) → Metals lands after E (last).
      const r = resolveDragEnd(sample(), "group:Metals", "E", {
        placeAfter: true,
      });
      expect(r).not.toBeNull();
      expect(r!.orderedIds).toEqual(["A", "B", "C", "E", "D"]);
    });

    it("moves a group to last when there is only one other (loose) entry", () => {
      // [G(A,B), C loose]; without placeAfter, dropping G on C inserts BEFORE C
      // → no-op (the #6 bug). placeAfter inserts after → C, then G.
      const layout = [
        h({ id: "A", group: "G", sortOrder: 0 }),
        h({ id: "B", group: "G", sortOrder: 1 }),
        h({ id: "C", group: null, sortOrder: 2 }),
      ];
      expect(resolveDragEnd(layout, "group:G", "C")).toBeNull(); // before = no-op
      const r = resolveDragEnd(layout, "group:G", "C", { placeAfter: true });
      expect(r!.orderedIds).toEqual(["C", "A", "B"]);
    });
  });

  // UAT #5 / #7: a loose holding dragged ABOVE a top group must land loose above
  // it, not get swallowed into the group. `asLoose` is set by the section when the
  // dragged row's midpoint is above the group header's midpoint.
  describe("asLoose (drop a holding above a group header → stays loose)", () => {
    it("places an already-loose holding above the top group, no group change", () => {
      const r = resolveDragEnd(sample(), "C", "group:Brokerage", {
        asLoose: true,
      });
      expect(r).not.toBeNull();
      expect(r!.groupChange).toBeUndefined();
      expect(r!.orderedIds).toEqual(["C", "A", "B", "D", "E"]);
    });

    it("ungroups a grouped child dropped above a top group (loose)", () => {
      const r = resolveDragEnd(sample(), "D", "group:Brokerage", {
        asLoose: true,
      });
      expect(r!.groupChange).toEqual({ holdingId: "D", group: null });
      expect(r!.orderedIds).toEqual(["D", "A", "B", "C", "E"]);
    });

    it("still JOINS (not loose) when asLoose is not set — default unchanged", () => {
      const r = resolveDragEnd(sample(), "C", "group:Brokerage");
      expect(r!.groupChange).toEqual({ holdingId: "C", group: "Brokerage" });
      expect(r!.orderedIds).toEqual(["C", "A", "B", "D", "E"]);
    });
  });
});

// The HOLDING drag resolver used by the live section: the React island measures
// where the dragged row's centre landed (insertIndex + the group whose children-
// span it fell within, or null=loose) and this maps it to a flat order + group
// change. Children-span model → a row can be placed loose adjacent to ANY group and
// a 2-item group's items still reorder, without explicit drop zones (UAT #1/#2).
describe("resolveHoldingDrop (geometry-driven holding placement)", () => {
  it("reorders within a group (drop on the first member → become first)", () => {
    // B → index 0, target Brokerage → [B,A,...], stays grouped.
    const r = resolveHoldingDrop(sample(), "B", 0, "Brokerage");
    expect(r).not.toBeNull();
    expect(r!.groupChange).toBeUndefined();
    expect(r!.orderedIds).toEqual(["B", "A", "C", "D", "E"]);
  });

  it("ejects a grouped child to loose at the end (target null, last index)", () => {
    const r = resolveHoldingDrop(sample(), "B", 4, null);
    expect(r!.groupChange).toEqual({ holdingId: "B", group: null });
    expect(r!.orderedIds).toEqual(["A", "C", "D", "E", "B"]);
  });

  it("joins a loose holding into a group at the chosen slot", () => {
    const r = resolveHoldingDrop(sample(), "C", 1, "Brokerage");
    expect(r!.groupChange).toEqual({ holdingId: "C", group: "Brokerage" });
    expect(r!.orderedIds).toEqual(["A", "C", "B", "D", "E"]);
  });

  it("reorders a loose row to the front, staying loose", () => {
    const r = resolveHoldingDrop(sample(), "E", 0, null);
    expect(r!.groupChange).toBeUndefined();
    expect(r!.orderedIds).toEqual(["E", "A", "B", "C", "D"]);
  });

  it("ejects from a SINGLE group (no loose rows) — drop below the only member", () => {
    const onlyGroup = [
      h({ id: "A", group: "G", sortOrder: 0 }),
      h({ id: "B", group: "G", sortOrder: 1 }),
    ];
    const r = resolveHoldingDrop(onlyGroup, "A", 1, null);
    expect(r!.groupChange).toEqual({ holdingId: "A", group: null });
    expect(r!.orderedIds).toEqual(["B", "A"]);
  });

  it("places a loose row ABOVE a leading group (index 0, target null)", () => {
    // D (Metals) → loose at the very top, above Brokerage.
    const r = resolveHoldingDrop(sample(), "D", 0, null);
    expect(r!.groupChange).toEqual({ holdingId: "D", group: null });
    expect(r!.orderedIds).toEqual(["D", "A", "B", "C", "E"]);
  });

  it("is a no-op when nothing changes (same slot, same group)", () => {
    expect(resolveHoldingDrop(sample(), "A", 0, "Brokerage")).toBeNull();
  });
});
