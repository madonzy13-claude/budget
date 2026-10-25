/**
 * investment-types.test.ts — the currency-choice predicate.
 *
 * usesUserChosenCurrency(uiType) drives whether the add-investment form keeps the
 * currency picker AND FX-converts the fetched price. Crypto has always qualified;
 * equity + ETF now do too (a US stock quoted in USD can be tracked/valued in the
 * budget's currency, converted via FX — same as crypto/metals).
 */
import { describe, it, expect } from "vitest";
import { unitPriceCents,
  usesUserChosenCurrency,
  UI_TYPE_META,
  UI_TYPE_ORDER,
  deriveUiType,
} from "@/lib/investment-types";

describe("usesUserChosenCurrency", () => {
  it("equity + ETF are user-currency (FX-converted), like crypto", () => {
    expect(usesUserChosenCurrency("equity")).toBe(true);
    expect(usesUserChosenCurrency("etf")).toBe(true);
    expect(usesUserChosenCurrency("crypto")).toBe(true);
  });

  it("fixed/manual-valued types are not", () => {
    expect(usesUserChosenCurrency("deposit")).toBe(false);
    expect(usesUserChosenCurrency("cash")).toBe(false);
    expect(usesUserChosenCurrency("broker")).toBe(false);
    expect(usesUserChosenCurrency("collectibles")).toBe(false);
    expect(usesUserChosenCurrency("savings")).toBe(false);
    expect(usesUserChosenCurrency("")).toBe(false);
    expect(usesUserChosenCurrency(null)).toBe(false);
  });
});

describe("savings ui type", () => {
  it("maps to its own savings holding_type, manual (broker-shaped) behavior", () => {
    // Own holding_type → own investments-pie slice. Behavior 'broker' reuses the
    // proven name+starting+current+currency (qty=1) field-set.
    expect(UI_TYPE_META.savings).toEqual({
      holdingType: "savings",
      behavior: "broker",
    });
  });

  it("is offered in the type dropdown", () => {
    expect(UI_TYPE_ORDER).toContain("savings");
  });

  it("deriveUiType resolves savings from stored ui_type or the holding_type", () => {
    expect(deriveUiType("savings", "savings", true)).toBe("savings");
    expect(deriveUiType(null, "savings", true)).toBe("savings");
  });
});

// user, 261023: the row's amount is the TOTAL (quantity × price). Editing it
// inline must store the per-unit price, or a 3-unit holding triples.
describe("unitPriceCents", () => {
  it("divides the typed total by the quantity", () => {
    expect(unitPriceCents(30000, "3")).toBe("10000");
  });

  it("keeps a single-unit value as-is", () => {
    expect(unitPriceCents(72550, "1.00000000")).toBe("72550");
  });

  // user, 261023: 170 over 3 units must come back as 170, not 169.98.
  it("keeps sub-cent precision so quantity × price returns the typed total", () => {
    expect(unitPriceCents(17000, "3")).toBe("5666.666667");
    expect(Math.round(3 * Number(unitPriceCents(17000, "3")))).toBe(17000);
  });

  it("handles a fractional quantity", () => {
    expect(unitPriceCents(5000, "0.5")).toBe("10000");
  });

  it("falls back to the total when the quantity is zero or unreadable", () => {
    expect(unitPriceCents(5000, "0")).toBe("5000");
    expect(unitPriceCents(5000, "")).toBe("5000");
  });
});
