import { describe, test, expect } from "bun:test";
import {
  holdingValue,
  profitLossPct,
  profitLossCents,
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

describe("bullion premium (metals: current/resale value = spot × (1 + premium%))", () => {
  test("gold (g) with +20% premium: value = melt × 1.20", () => {
    const h = mk({
      holdingType: "commodity",
      uiType: "precious_metals",
      metal: "gold",
      unitOfMeasure: "g",
      quantity: "100",
      currentPriceCents: 200000n,
      premiumPct: "20",
    });
    // melt = 200000*0.03215074656862*100 = 643014.9314; ×1.20 = 771617.9177
    expect(holdingValue(h).toFixed(2)).toBe("771617.92");
  });

  test("no premium (null) keeps the melt/spot value", () => {
    const h = mk({
      holdingType: "commodity",
      uiType: "precious_metals",
      metal: "gold",
      unitOfMeasure: "g",
      quantity: "100",
      currentPriceCents: 200000n,
      premiumPct: null,
    });
    expect(holdingValue(h).toFixed(2)).toBe("643014.93");
  });

  test("premium lifts profitLossCents (resale value > melt)", () => {
    const h = mk({
      holdingType: "commodity",
      uiType: "precious_metals",
      metal: "gold",
      unitOfMeasure: "g",
      buyPriceCents: 6000n,
      buyCurrency: "USD",
      currentPriceCents: 200000n,
      currentPriceCurrency: "USD",
      quantity: "100",
      premiumPct: "20",
    });
    // per-g current = 6430.149*1.20 = 7716.179; (7716.179 - 6000)*100
    expect(Number(profitLossCents(h))).toBeCloseTo(171617.9, 0);
  });

  test("premium is ignored for non-metals (equity unaffected)", () => {
    const h = mk({
      quantity: "10",
      currentPriceCents: 42000n,
      premiumPct: "20",
    });
    expect(holdingValue(h).toString()).toBe("420000");
  });
});

describe("profitLossCents (absolute P/L, cents, FX-converted, quantity-scaled)", () => {
  test("same currency, gain: buy 100.00, current 112.40, qty 1 => +1240c", () => {
    const h = mk({
      buyPriceCents: 10000n,
      buyCurrency: "USD",
      currentPriceCents: 11240n,
      currentPriceCurrency: "USD",
      quantity: "1",
    });
    expect(profitLossCents(h)).toBe("1240");
  });

  // 260626 regression: a near-total loss rounds the PERCENT to -100.0, which broke
  // the client's old value/(1+pct/100) back-derivation (÷0 → "-0"). The absolute
  // P/L must stay a real, large negative number.
  test("near-total loss does NOT collapse to 0: buy 100.00, current 0.01, qty 1 => -9999c", () => {
    const h = mk({
      buyPriceCents: 10000n,
      buyCurrency: "EUR",
      currentPriceCents: 1n,
      currentPriceCurrency: "EUR",
      quantity: "1",
    });
    expect(profitLossPct(h)).toBe(-100); // the rounding that broke the old hack
    expect(profitLossCents(h)).toBe("-9999"); // but the absolute is correct
  });

  test("quantity scales the absolute P/L: buy 100, current 110, qty 10 => +10000c", () => {
    const h = mk({
      buyPriceCents: 10000n,
      buyCurrency: "USD",
      currentPriceCents: 11000n,
      currentPriceCurrency: "USD",
      quantity: "10",
    });
    expect(profitLossCents(h)).toBe("10000");
  });

  test("precious metals (g): per-g buy vs spot/oz converted, x quantity", () => {
    const h = mk({
      holdingType: "commodity",
      uiType: "precious_metals",
      metal: "gold",
      unitOfMeasure: "g",
      buyPriceCents: 6000n, // 60.00/g (cents), comparable to the per-g spot below
      buyCurrency: "USD",
      currentPriceCents: 200000n, // 2000.00/oz spot
      currentPriceCurrency: "USD",
      quantity: "100",
    });
    // per-g current = 200000*0.03215074656862 = 6430.149c; (6430.149-6000)*100
    expect(Number(profitLossCents(h))).toBeCloseTo(43014.93, 0);
  });

  test("FX-converted (current ccy -> buy ccy via rate): buy 100 USD, current 120 EUR @0.9 => +800c", () => {
    const h = mk({
      buyPriceCents: 10000n,
      buyCurrency: "USD",
      currentPriceCents: 12000n,
      currentPriceCurrency: "EUR",
      quantity: "1",
    });
    expect(profitLossCents(h, "0.9")).toBe("800");
  });

  test("cash => null", () => {
    const h = mk({
      holdingType: "cash_fx",
      quantity: "1",
      currentPriceCents: 50000n,
    });
    expect(profitLossCents(h)).toBeNull();
  });

  test("missing buy price => null", () => {
    const h = mk({ buyPriceCents: null });
    expect(profitLossCents(h)).toBeNull();
  });
});
