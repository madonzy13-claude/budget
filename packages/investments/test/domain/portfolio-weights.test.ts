import { describe, test, expect } from "bun:test";
import {
  portfolioWeights,
  groupWeights,
} from "../../src/domain/portfolio-metrics";
import { mk } from "./holding.test";

const sum = (m: Map<string, number>) =>
  [...m.values()].reduce((a, b) => a + b, 0);

describe("portfolioWeights (per-holding %, budget-ccy denominator)", () => {
  test("two grouped holdings (Broker A): within-group weights sum to ~100%", () => {
    const hs = [
      mk({
        id: "a",
        group: "Broker A",
        currentPriceCents: 10000n,
        quantity: "1",
      }),
      mk({
        id: "b",
        group: "Broker A",
        currentPriceCents: 30000n,
        quantity: "1",
      }),
    ];
    const w = portfolioWeights(hs, {}, "USD");
    expect(w.get("a")).toBe(25);
    expect(w.get("b")).toBe(75);
    expect(sum(w)).toBeCloseTo(100, 1);
  });

  test("three ungrouped holdings: whole-portfolio weights sum to ~100%", () => {
    const hs = [
      mk({ id: "a", group: null, currentPriceCents: 10000n, quantity: "1" }),
      mk({ id: "b", group: null, currentPriceCents: 20000n, quantity: "1" }),
      mk({ id: "c", group: null, currentPriceCents: 20000n, quantity: "1" }),
    ];
    const w = portfolioWeights(hs, {}, "USD");
    expect(w.get("a")).toBe(20);
    expect(w.get("b")).toBe(40);
    expect(w.get("c")).toBe(40);
    expect(sum(w)).toBeCloseTo(100, 1);
  });

  test("mixed currencies: denominator computed in budget default (EUR); USD holding's weight reflects its EUR value", () => {
    const hs = [
      mk({
        id: "eur",
        group: null,
        currentPriceCents: 10000n,
        currentPriceCurrency: "EUR",
        quantity: "1",
      }),
      mk({
        id: "usd",
        group: null,
        currentPriceCents: 10000n,
        currentPriceCurrency: "USD",
        quantity: "1",
      }),
    ];
    // budget EUR; USD->EUR rate 0.9. eur value 10000 EUR; usd value 9000 EUR; total 19000 EUR.
    const w = portfolioWeights(hs, { USD: "0.9" }, "EUR");
    expect(w.get("usd")).toBeCloseTo(47.37, 1); // 9000/19000, NOT 50
    expect(w.get("eur")).toBeCloseTo(52.63, 1);
    expect(w.get("eur")!).toBeGreaterThan(w.get("usd")!);
    expect(sum(w)).toBeCloseTo(100, 1);
  });
});

describe("groupWeights (group-% of portfolio total)", () => {
  test("two groups: group-% values sum to ~100%", () => {
    const hs = [
      mk({
        id: "a",
        group: "Broker A",
        currentPriceCents: 30000n,
        quantity: "1",
      }),
      mk({
        id: "b",
        group: "Broker B",
        currentPriceCents: 10000n,
        quantity: "1",
      }),
    ];
    const g = groupWeights(hs, {}, "USD");
    expect(g.get("Broker A")).toBe(75);
    expect(g.get("Broker B")).toBe(25);
    expect(sum(g)).toBeCloseTo(100, 1);
  });
});
