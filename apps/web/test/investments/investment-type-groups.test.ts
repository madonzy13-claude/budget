/**
 * investment-type-groups.test.ts — Phase 13 type blocks + header math
 * (D-13..D-16): one block per type with holdings, saved order first, header
 * P/L = unrealized + realized over LIFETIME cost (never ÷ cost still held).
 */
import { describe, it, expect } from "vitest";
import type { HoldingDto } from "@/hooks/use-investments";
import {
  buildTypeBlocks,
  typeGroupPL,
  portfolioPL,
  moveTypeBlock,
} from "@/lib/investment-type-groups";

let seq = 0;
function h(over: Partial<HoldingDto>): HoldingDto {
  seq++;
  return {
    id: `h${seq}`,
    name: `H${seq}`,
    holdingType: "equities",
    uiType: "stocks",
    icon: null,
    color: null,
    group: null,
    instrumentId: null,
    metal: null,
    metalKind: null,
    unitOfMeasure: null,
    premiumPct: null,
    symbol: null,
    instrumentName: null,
    instrumentProvider: null,
    isCustom: false,
    isDelisted: false,
    quantity: "1",
    buyPriceCents: null,
    buyCurrency: "PLN",
    currentPriceCents: null,
    currentPriceCurrency: "PLN",
    priceFetchedAt: null,
    valueCents: "0",
    valueInBudgetCents: "0",
    costInBudgetCents: "0",
    profitLossPct: null,
    profitLossCents: null,
    weightPct: 0,
    sortOrder: seq,
    createdAt: "2026-01-01T00:00:00Z",
    depositRateBps: null,
    depositStartDate: null,
    depositEndDate: null,
    depositCapFrequency: null,
    ...over,
  };
}

describe("buildTypeBlocks", () => {
  it("saved order first, then the rest in picker order; empty types absent", () => {
    const blocks = buildTypeBlocks(
      [h({ uiType: "stocks" }), h({ uiType: "crypto", holdingType: "crypto" })],
      ["equity", "crypto"],
    );
    expect(blocks.map((b) => b.uiType)).toEqual(["crypto", "stocks"]);
  });

  it("sorts holdings by sortOrder within a block", () => {
    const [b] = buildTypeBlocks(
      [h({ id: "b", sortOrder: 2 }), h({ id: "a", sortOrder: 1 })],
      [],
    );
    expect(b!.holdings.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("legacy ui types land in the stocks block", () => {
    const blocks = buildTypeBlocks(
      [h({ uiType: "etf", holdingType: "etf" })],
      [],
    );
    expect(blocks.map((b) => b.uiType)).toEqual(["stocks"]);
  });
});

describe("typeGroupPL (D-15/D-16)", () => {
  it("A(30k/17.2k) + B(50k/40k) + realized 28.2k on sold cost 37.8k → +51k, +53.7%", () => {
    const pl = typeGroupPL(
      [
        h({
          valueInBudgetCents: "3000000",
          costInBudgetCents: "1720000",
          profitLossPct: 74.4,
        }),
        h({
          valueInBudgetCents: "5000000",
          costInBudgetCents: "4000000",
          profitLossPct: 25,
        }),
      ],
      { realizedBudgetCents: "2820000", soldCostBudgetCents: "3780000" },
    );
    expect(pl.valueBudgetCents).toBe(8_000_000);
    expect(pl.unrealizedCents).toBe(2_280_000);
    expect(pl.realizedCents).toBe(2_820_000);
    expect(pl.totalPLCents).toBe(5_100_000);
    expect(pl.lifetimeCostCents).toBe(9_500_000);
    expect(pl.pct).toBeCloseTo(53.7, 1);
  });

  it("no summary: realized 0, % over held cost", () => {
    const pl = typeGroupPL([
      h({
        valueInBudgetCents: "1500",
        costInBudgetCents: "1000",
        profitLossPct: 50,
      }),
    ]);
    expect(pl.realizedCents).toBe(0);
    expect(pl.pct).toBeCloseTo(50, 5);
  });

  it("derives cost from value and P/L % when the server cost is missing (optimistic row)", () => {
    const row = h({ valueInBudgetCents: "1100", profitLossPct: 10 });
    delete (row as Partial<HoldingDto>).costInBudgetCents;
    const pl = typeGroupPL([row]);
    expect(pl.lifetimeCostCents).toBeCloseTo(1000, 6);
    expect(pl.unrealizedCents).toBeCloseTo(100, 6);
  });

  it("no basis anywhere and no realized → pct null", () => {
    const pl = typeGroupPL([h({ valueInBudgetCents: "500" })]);
    expect(pl.pct).toBeNull();
  });
});

describe("portfolioPL (D-14)", () => {
  it("includes realized of types with no holdings left", () => {
    const pl = portfolioPL(
      [
        h({
          valueInBudgetCents: "2000000",
          costInBudgetCents: "1000000",
          profitLossPct: 100,
        }),
      ],
      {
        currency: "PLN",
        order: [],
        types: {
          broker: {
            realizedBudgetCents: "500000",
            soldCostBudgetCents: "1000000",
          },
        },
      },
    );
    expect(pl.totalPLCents).toBe(1_500_000);
    expect(pl.hiddenRealizedCents).toBe(500_000);
    expect(pl.lifetimeCostCents).toBe(2_000_000);
  });
});

describe("moveTypeBlock", () => {
  it("moves a block like arrayMove", () => {
    expect(
      moveTypeBlock(["stocks", "crypto", "cash"], "cash", "stocks"),
    ).toEqual(["cash", "stocks", "crypto"]);
  });
});
