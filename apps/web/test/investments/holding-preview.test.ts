import { describe, it, expect } from "vitest";
import { computeHoldingPreview } from "../../src/lib/holding-preview";

const base = {
  currency: "EUR",
  quantity: "1",
  buyPrice: "",
  currentPrice: "",
  uom: "g" as const,
  premiumPct: "",
};

describe("computeHoldingPreview — sum-up across every holding type", () => {
  it("no type chosen → null", () => {
    expect(computeHoldingPreview({ ...base, behavior: null })).toBeNull();
  });

  it("tracked: buy×qty, current×qty, P/L", () => {
    const p = computeHoldingPreview({
      ...base,
      behavior: "tracked",
      quantity: "10",
      buyPrice: "100",
      currentPrice: "112.40",
    })!;
    expect(p.showQty).toBe(true);
    expect(p.buyTotal).toBe(1000);
    expect(p.actualBase).toBeCloseTo(1124, 2);
    expect(p.actualTotal).toBeCloseTo(1124, 2);
    expect(p.premiumAmount).toBe(0);
    expect(p.pl).toBeCloseTo(124, 2);
    expect(p.plPct).toBeCloseTo(12.4, 3);
  });

  it("manual with NO buy price → no buy total, no P/L (just current value)", () => {
    const p = computeHoldingPreview({
      ...base,
      behavior: "manual",
      quantity: "2",
      buyPrice: "",
      currentPrice: "50",
    })!;
    expect(p.buyTotal).toBeNull();
    expect(p.actualBase).toBe(100);
    expect(p.pl).toBeNull();
    expect(p.plPct).toBeNull();
  });

  it("metals: spot/oz → per-UoM × qty, premium added separately", () => {
    const p = computeHoldingPreview({
      ...base,
      behavior: "metals",
      quantity: "100",
      buyPrice: "60",
      currentPrice: "2000", // spot/oz
      uom: "g",
      premiumPct: "20",
    })!;
    // per-g = 2000*0.03215074656862 = 64.30149; ×100 = 6430.149
    expect(p.actualUnit).toBeCloseTo(64.3015, 3);
    expect(p.actualBase).toBeCloseTo(6430.149, 2);
    expect(p.premiumPct).toBe(20);
    expect(p.premiumAmount).toBeCloseTo(1286.03, 1);
    expect(p.actualTotal).toBeCloseTo(7716.18, 1);
    expect(p.buyTotal).toBe(6000);
    expect(p.pl).toBeCloseTo(1716.18, 1);
    expect(p.plPct).toBeCloseTo(28.6, 1);
  });

  it("metals with no premium → actual total equals base", () => {
    const p = computeHoldingPreview({
      ...base,
      behavior: "metals",
      quantity: "10",
      buyPrice: "60",
      currentPrice: "2000",
      uom: "oz",
      premiumPct: "",
    })!;
    expect(p.premiumAmount).toBe(0);
    expect(p.actualTotal).toBe(p.actualBase);
    expect(p.actualBase).toBe(20000); // 2000/oz × 10 oz
  });

  it("broker: deposited vs actual, qty hidden (single-unit), P/L", () => {
    const p = computeHoldingPreview({
      ...base,
      behavior: "broker",
      quantity: "1",
      buyPrice: "10000", // deposited
      currentPrice: "11250", // actual
    })!;
    expect(p.showQty).toBe(false);
    expect(p.buyTotal).toBe(10000);
    expect(p.actualTotal).toBe(11250);
    expect(p.pl).toBe(1250);
    expect(p.plPct).toBeCloseTo(12.5, 3);
  });

  it("cash: amount only — no buy total, no P/L, no qty", () => {
    const p = computeHoldingPreview({
      ...base,
      behavior: "cash",
      currentPrice: "500",
    })!;
    expect(p.showQty).toBe(false);
    expect(p.buyTotal).toBeNull();
    expect(p.actualTotal).toBe(500);
    expect(p.pl).toBeNull();
    expect(p.plPct).toBeNull();
  });

  it("premium is ignored for non-metals even if a value leaks in", () => {
    const p = computeHoldingPreview({
      ...base,
      behavior: "tracked",
      quantity: "1",
      buyPrice: "100",
      currentPrice: "100",
      premiumPct: "50",
    })!;
    expect(p.premiumAmount).toBe(0);
    expect(p.actualTotal).toBe(100);
    expect(p.pl).toBe(0);
  });
});
