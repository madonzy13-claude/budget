import { describe, it, expect } from "vitest";
import {
  computeHoldingPreview,
  depositPreviewValue,
} from "../../src/lib/holding-preview";

describe("deposit preview", () => {
  it("projects value past principal and reports P/L = accrued interest", () => {
    const p = computeHoldingPreview({
      behavior: "deposit",
      currency: "USD",
      quantity: "1",
      buyPrice: "1000", // principal
      currentPrice: "",
      uom: "g",
      premiumPct: "",
      depositRatePct: "12",
      depositStart: "2020-01-01", // well in the past
      depositFreq: "monthly",
    })!;
    const value = p.actualTotal;
    const principal = 1000;
    expect(p.buyTotal).toBe(principal);
    expect(value).toBeGreaterThan(principal);
    expect(p.pl!).toBeCloseTo(value - principal, 6);
    expect(p.plPct!).toBeGreaterThan(0);
    expect(p.showQty).toBe(false); // a deposit has no quantity
  });

  it("freezes at the maturity (end) date", () => {
    const frozen = depositPreviewValue(
      1000,
      12,
      "2020-01-01",
      "monthly",
      "2020-02-01",
      Date.UTC(2025, 0, 1),
    );
    const atEnd = depositPreviewValue(
      1000,
      12,
      "2020-01-01",
      "monthly",
      "2020-02-01",
      Date.UTC(2020, 1, 1),
    );
    expect(frozen).toBeCloseTo(atEnd, 6);
  });

  it("daily capitalization compounds each day", () => {
    // 36.5%/yr = 0.1%/day → 10 days ≈ 1000 × 1.001^10
    const v = depositPreviewValue(
      1000,
      36.5,
      "2025-01-01",
      "daily",
      undefined,
      Date.UTC(2025, 0, 11),
    );
    expect(v).toBeCloseTo(1000 * Math.pow(1.001, 10), 4);
  });

  it("returns principal for zero rate or a future start", () => {
    expect(
      depositPreviewValue(
        1000,
        0,
        "2020-01-01",
        "monthly",
        undefined,
        Date.UTC(2025, 0, 1),
      ),
    ).toBe(1000);
    expect(
      depositPreviewValue(
        1000,
        12,
        "2999-01-01",
        "monthly",
        undefined,
        Date.UTC(2025, 0, 1),
      ),
    ).toBe(1000);
  });
});
