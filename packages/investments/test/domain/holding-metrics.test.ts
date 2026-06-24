import { describe, test, expect } from "bun:test";
import {
  holdingValue,
  profitLossPct,
} from "../../src/domain/portfolio-metrics";
import { mk } from "./holding.test";

describe("holdingValue (quantity x current price, big.js cents)", () => {
  test("whole quantity: 10 x 420.00 => 420000 cents (4200.00)", () => {
    const h = mk({ quantity: "10", currentPriceCents: 42000n });
    expect(holdingValue(h).toString()).toBe("420000");
  });

  test("fractional crypto: 0.12345678 x 420.00 => exact big.js product, no float drift", () => {
    const h = mk({
      holdingType: "crypto",
      quantity: "0.12345678",
      currentPriceCents: 42000n,
    });
    // 0.12345678 * 42000 = 5185.18476 (exact)
    expect(holdingValue(h).toString()).toBe("5185.18476");
  });

  test("cash_fx: value equals the cash amount (currentPriceCents), quantity ignored", () => {
    const h = mk({
      holdingType: "cash_fx",
      quantity: "1",
      currentPriceCents: 50000n,
    });
    expect(holdingValue(h).toString()).toBe("50000");
  });

  test("precious metals (g): spot/oz converted to grams x quantity", () => {
    // spot 200000c/oz ($2000); 100 g; per-g = 200000/31.1034768 = 6430.149...
    // value = 100 * per-g = 643014.93... cents.
    const h = mk({
      holdingType: "commodity",
      uiType: "precious_metals",
      metal: "gold",
      unitOfMeasure: "g",
      quantity: "100",
      currentPriceCents: 200000n,
    });
    // 200000 * 0.03215074656862 * 100 = 643014.9313724
    expect(holdingValue(h).toFixed(2)).toBe("643014.93");
  });

  test("precious metals (oz): spot x quantity unchanged", () => {
    const h = mk({
      holdingType: "commodity",
      uiType: "precious_metals",
      metal: "gold",
      unitOfMeasure: "oz",
      quantity: "2",
      currentPriceCents: 200000n,
    });
    expect(holdingValue(h).toString()).toBe("400000");
  });
});

describe("profitLossPct (signed %, FX-converted, 1 decimal)", () => {
  test("same currency, gain: buy 100.00, current 112.40 => +12.4%", () => {
    const h = mk({
      buyPriceCents: 10000n,
      buyCurrency: "USD",
      currentPriceCents: 11240n,
      currentPriceCurrency: "USD",
    });
    expect(profitLossPct(h)).toBe(12.4);
  });

  test("same currency, loss: buy 100.00, current 91.80 => -8.2%", () => {
    const h = mk({
      buyPriceCents: 10000n,
      buyCurrency: "USD",
      currentPriceCents: 9180n,
      currentPriceCurrency: "USD",
    });
    expect(profitLossPct(h)).toBe(-8.2);
  });

  test("cross currency: bought EUR, priced USD, rate USD->EUR applied BEFORE comparison", () => {
    // buy 100.00 EUR; current 120.00 USD; rate USD->EUR = 0.9 => 108.00 EUR => +8.0%
    const h = mk({
      buyPriceCents: 10000n,
      buyCurrency: "EUR",
      currentPriceCents: 12000n,
      currentPriceCurrency: "USD",
    });
    expect(profitLossPct(h, "0.9")).toBe(8);
  });

  test("cash_fx has no P/L => null sentinel", () => {
    const h = mk({ holdingType: "cash_fx", currentPriceCents: 50000n });
    expect(profitLossPct(h)).toBeNull();
  });

  test("no buy basis (null buyPriceCents) => null", () => {
    const h = mk({ buyPriceCents: null, currentPriceCents: 12000n });
    expect(profitLossPct(h)).toBeNull();
  });
});

describe("broker holding (deposited vs actual, qty=1)", () => {
  // ui_type 'broker' -> holding_type 'other', no instrument, quantity 1.
  // deposited = buyPriceCents (basis); actual = currentPriceCents (value).
  test("value equals the actual value (quantity 1, no instrument)", () => {
    const h = mk({
      holdingType: "other",
      uiType: "broker",
      instrumentId: null,
      quantity: "1",
      buyPriceCents: 1000000n, // deposited 10,000.00
      buyCurrency: "PLN",
      currentPriceCents: 1125000n, // actual 11,250.00
      currentPriceCurrency: "PLN",
    });
    expect(holdingValue(h).toString()).toBe("1125000");
  });

  test("P/L = (actual − deposited) / deposited: 10,000 → 11,250 = +12.5%", () => {
    const h = mk({
      holdingType: "other",
      uiType: "broker",
      instrumentId: null,
      quantity: "1",
      buyPriceCents: 1000000n,
      buyCurrency: "PLN",
      currentPriceCents: 1125000n,
      currentPriceCurrency: "PLN",
    });
    expect(profitLossPct(h)).toBe(12.5);
  });
});
