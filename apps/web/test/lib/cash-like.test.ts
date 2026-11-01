import { describe, it, expect } from "vitest";
import { isCashLike } from "../../src/lib/cash-like";

describe("isCashLike", () => {
  it("cash and stablecoins are money, not investments", () => {
    expect(isCashLike({ holdingType: "cash_fx", uiType: "cash" })).toBe(true);
    expect(isCashLike({ uiType: "cash" })).toBe(true);
    // Manual tickers, and catalog ids (a holding's symbol is the CoinGecko id).
    for (const symbol of ["USDT", "usdc", "DAI", "EURC", "tether", "euro-coin"])
      expect(isCashLike({ uiType: "crypto", symbol })).toBe(true);
  });
  it("anything else is not", () => {
    expect(isCashLike({ uiType: "crypto", symbol: "BTC" })).toBe(false);
    expect(isCashLike({ uiType: "crypto", symbol: "bitcoin" })).toBe(false);
    expect(isCashLike({ uiType: "stocks", symbol: null })).toBe(false);
  });
});
