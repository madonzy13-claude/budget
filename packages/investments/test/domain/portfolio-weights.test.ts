import { describe, test, expect } from "bun:test";
import * as metrics from "../../src/domain/portfolio-metrics";
import {
  portfolioWeights,
  typeWeights,
} from "../../src/domain/portfolio-metrics";
import { mk } from "./holding.test";

const sum = (m: Map<string, number>) =>
  [...m.values()].reduce((a, b) => a + b, 0);

// Phase 13: groups are the investment type — a row's weight is its share
// within its type; a type's weight is its share of the portfolio.
describe("portfolioWeights (per-holding % within its type, budget-ccy denominator)", () => {
  test("two stocks (60/40) + one crypto → 60%, 40%, 100%", () => {
    const hs = [
      mk({ id: "a", uiType: "stocks", currentPriceCents: 6000n }),
      mk({ id: "b", uiType: "stocks", currentPriceCents: 4000n }),
      mk({ id: "c", uiType: "crypto", currentPriceCents: 10000n }),
    ];
    const w = portfolioWeights(hs, {}, "USD");
    expect(w.get("a")).toBe(60);
    expect(w.get("b")).toBe(40);
    expect(w.get("c")).toBe(100);
  });

  test("mixed currencies: the type denominator is in the budget currency", () => {
    const hs = [
      mk({
        id: "eur",
        uiType: "cash",
        currentPriceCents: 10000n,
        currentPriceCurrency: "EUR",
      }),
      mk({
        id: "usd",
        uiType: "cash",
        currentPriceCents: 10000n,
        currentPriceCurrency: "USD",
      }),
    ];
    // budget EUR; USD->EUR 0.9 → 10000 + 9000 = 19000 EUR
    const w = portfolioWeights(hs, { USD: "0.9" }, "EUR");
    expect(w.get("usd")).toBeCloseTo(47.37, 1);
    expect(w.get("eur")).toBeCloseTo(52.63, 1);
    expect(sum(w)).toBeCloseTo(100, 1);
  });

  test("custom groups are gone: no groupWeights export", () => {
    expect("groupWeights" in metrics).toBe(false);
  });
});

describe("typeWeights (share of portfolio per investment type)", () => {
  test("two stocks (60/40) + one crypto (100) → stocks 50, crypto 50", () => {
    const w = typeWeights(
      [
        mk({ id: "a", uiType: "stocks", currentPriceCents: 6000n }),
        mk({ id: "b", uiType: "stocks", currentPriceCents: 4000n }),
        mk({ id: "c", uiType: "crypto", currentPriceCents: 10000n }),
      ],
      {},
      "USD",
    );
    expect(w.get("stocks")).toBe(50);
    expect(w.get("crypto")).toBe(50);
  });

  test("a holding without a ui type counts as other", () => {
    const h = mk({ id: "x", uiType: null, currentPriceCents: 100n });
    expect(typeWeights([h], {}, "USD").get("other")).toBe(100);
  });
});
