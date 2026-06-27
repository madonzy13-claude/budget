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
  withPersistentGroups,
  UNGROUPED_DROP_ID,
  LOOSE_TOP_DROP_ID,
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

describe("withPersistentGroups (group stays put while its last item is dragged)", () => {
  // Snapshot the entry order at drag-start.
  const snapshotOf = (holdings: HoldingDto[]) =>
    buildInvestmentEntries(holdings).map((e) =>
      e.kind === "group"
        ? { key: `group:${e.name}`, group: e.name }
        : { key: `loose:${e.holding.id}` },
    );

  it("re-inserts a now-empty group (its last member dragged out) at its spot, empty", () => {
    const snapshot = snapshotOf(sample()); // A,B in Brokerage; C loose; D in Metals; E loose
    // Mid-drag: D (Metals' only member) pulled out to loose → Metals is empty.
    const live = buildInvestmentEntries([
      h({ id: "A", group: "Brokerage", sortOrder: 0 }),
      h({ id: "B", group: "Brokerage", sortOrder: 1 }),
      h({ id: "C", group: null, sortOrder: 2 }),
      h({ id: "D", group: null, sortOrder: 3 }), // moved out of Metals
      h({ id: "E", group: null, sortOrder: 4 }),
    ]);
    expect(
      live.find((e) => e.kind === "group" && e.name === "Metals"),
    ).toBeUndefined();

    const out = withPersistentGroups(live, snapshot);
    const metals = out.find((e) => e.kind === "group" && e.name === "Metals");
    expect(metals).toBeTruthy();
    expect(metals && metals.kind === "group" && metals.holdings).toHaveLength(
      0,
    );
  });

  it("returns the entries unchanged when no snapshot group went missing", () => {
    const entries = buildInvestmentEntries(sample());
    const snapshot = snapshotOf(sample());
    expect(withPersistentGroups(entries, snapshot)).toBe(entries);
  });
});

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

  // UAT #8: with a SINGLE group and NO loose rows there is no loose drop target,
  // so a child could never leave the group. The ungroup drop zone fixes that —
  // dropping a grouped holding on UNGROUPED_DROP_ID makes it loose at the end.
  describe("ungroup drop zone (UNGROUPED_DROP_ID)", () => {
    it("moves a grouped child out to loose even when it's the only group", () => {
      const onlyGroup = [
        h({ id: "A", group: "G", sortOrder: 0 }),
        h({ id: "B", group: "G", sortOrder: 1 }),
      ];
      const r = resolveDragEnd(onlyGroup, "A", UNGROUPED_DROP_ID);
      expect(r).not.toBeNull();
      expect(r!.groupChange).toEqual({ holdingId: "A", group: null });
      // B stays in G; A becomes loose at the end.
      expect(r!.orderedIds).toEqual(["B", "A"]);
    });

    it("ungroups a child from a multi-entry layout, landing it loose at the end", () => {
      const r = resolveDragEnd(sample(), "B", UNGROUPED_DROP_ID);
      expect(r!.groupChange).toEqual({ holdingId: "B", group: null });
      expect(r!.orderedIds).toEqual(["A", "C", "D", "E", "B"]);
    });

    it("moves an already-loose middle row to the END (loose-below-group, UAT #4)", () => {
      // C is loose in the middle of sample(); the bottom zone now means "place
      // loose at the end" (so a loose row can land below a trailing group).
      const r = resolveDragEnd(sample(), "C", UNGROUPED_DROP_ID);
      expect(r).not.toBeNull();
      expect(r!.groupChange).toBeUndefined();
      expect(r!.orderedIds).toEqual(["A", "B", "D", "E", "C"]);
    });

    it("is a no-op only when the row is already loose AND already last", () => {
      // E is loose and already last → bottom zone does nothing.
      expect(resolveDragEnd(sample(), "E", UNGROUPED_DROP_ID)).toBeNull();
    });
  });

  // UAT #3 / #4: explicit loose drop zones make boundary placement reliable — a
  // loose row can land at the very TOP (above a leading group) or the very END
  // (below a trailing group) without getting swallowed into the adjacent group.
  describe("loose boundary zones", () => {
    it("LOOSE_TOP places a grouped child loose at the very top", () => {
      const r = resolveDragEnd(sample(), "D", LOOSE_TOP_DROP_ID);
      expect(r!.groupChange).toEqual({ holdingId: "D", group: null });
      expect(r!.orderedIds).toEqual(["D", "A", "B", "C", "E"]);
    });

    it("LOOSE_TOP moves an already-loose middle row to the front (no group change)", () => {
      const r = resolveDragEnd(sample(), "C", LOOSE_TOP_DROP_ID);
      expect(r!.groupChange).toBeUndefined();
      expect(r!.orderedIds).toEqual(["C", "A", "B", "D", "E"]);
    });

    it("LOOSE_TOP is a no-op when the row is already loose AND already first", () => {
      const firstLoose = [
        h({ id: "X", group: null, sortOrder: 0 }),
        h({ id: "A", group: "G", sortOrder: 1 }),
      ];
      expect(resolveDragEnd(firstLoose, "X", LOOSE_TOP_DROP_ID)).toBeNull();
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
