/**
 * instrument-label.test.ts — ticker/name display for tracked instruments
 * (stock + crypto). Desktop shows "TICKER (Name)", mobile shows the ticker and
 * reveals the full name on tap.
 */
import { describe, it, expect } from "vitest";
import { instrumentLabel } from "../../src/lib/instrument-label";

describe("instrumentLabel", () => {
  it("equity → ticker = symbol, full = name", () => {
    expect(
      instrumentLabel({
        symbol: "AAPL",
        name: "Apple Inc.",
        holdingType: "equities",
      }),
    ).toEqual({ ticker: "AAPL", full: "Apple Inc." });
  });

  it("etf → ticker = symbol", () => {
    expect(
      instrumentLabel({
        symbol: "VOO",
        name: "Vanguard S&P 500 ETF",
        holdingType: "etf",
      }),
    ).toEqual({ ticker: "VOO", full: "Vanguard S&P 500 ETF" });
  });

  it("crypto → ticker parsed from the parenthetical, full = bare name", () => {
    // CoinGecko symbol is a slug ("bitcoin"); the ticker (BTC) is in the name.
    expect(
      instrumentLabel({
        symbol: "bitcoin",
        name: "Bitcoin (BTC)",
        holdingType: "crypto",
      }),
    ).toEqual({ ticker: "BTC", full: "Bitcoin" });
  });

  it("crypto without a parenthetical → ticker = upper(symbol)", () => {
    expect(
      instrumentLabel({
        symbol: "solana",
        name: "Solana",
        holdingType: "crypto",
      }),
    ).toEqual({ ticker: "SOLANA", full: "Solana" });
  });

  it("custom / no symbol → no ticker", () => {
    expect(
      instrumentLabel({
        symbol: null,
        name: "Vintage car",
        holdingType: "other",
      }),
    ).toEqual({ ticker: null, full: "Vintage car" });
  });
});
