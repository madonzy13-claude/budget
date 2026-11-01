import { describe, it, expect } from "vitest";
import { stablePeg } from "../../src/lib/stablecoins";

describe("stablePeg", () => {
  it("maps catalog stablecoins to the fiat they track", () => {
    expect(stablePeg("tether")).toBe("USD");
    expect(stablePeg("usd-coin")).toBe("USD");
    expect(stablePeg("euro-coin")).toBe("EUR");
    expect(stablePeg("tokenised-gbp")).toBe("GBP");
    expect(stablePeg("frankencoin")).toBe("CHF");
  });
  it("anything else (or a depegged coin) is null", () => {
    expect(stablePeg("bitcoin")).toBeNull();
    expect(stablePeg("terrausd")).toBeNull();
    expect(stablePeg(null)).toBeNull();
  });
});
