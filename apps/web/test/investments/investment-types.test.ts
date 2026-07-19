/**
 * investment-types.test.ts — the currency-choice predicate.
 *
 * usesUserChosenCurrency(uiType) drives whether the add-investment form keeps the
 * currency picker AND FX-converts the fetched price. Crypto has always qualified;
 * equity + ETF now do too (a US stock quoted in USD can be tracked/valued in the
 * budget's currency, converted via FX — same as crypto/metals).
 */
import { describe, it, expect } from "vitest";
import { usesUserChosenCurrency } from "@/lib/investment-types";

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
    expect(usesUserChosenCurrency("")).toBe(false);
    expect(usesUserChosenCurrency(null)).toBe(false);
  });
});
