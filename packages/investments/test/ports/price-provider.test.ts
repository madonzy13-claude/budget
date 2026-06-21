import { describe, test, expect } from "bun:test";
import {
  InMemoryPriceProvider,
  NoPriceAvailable,
} from "../../src/ports/price-provider";

describe("InMemoryPriceProvider (test stub)", () => {
  test("returns a seeded price by symbol", async () => {
    const p = new InMemoryPriceProvider({
      AAPL: { price: "189.50", currency: "USD" },
    });
    const q = await p.currentPrice("AAPL", "twelve_data");
    expect(q.price).toBe("189.50");
    expect(q.currency).toBe("USD");
    expect(q.provider).toBe("twelve_data");
  });

  test("supports provider-qualified keys (provider:symbol)", async () => {
    const p = new InMemoryPriceProvider({
      "coingecko:bitcoin": { price: "64000", currency: "USD" },
    });
    const q = await p.currentPrice("bitcoin", "coingecko");
    expect(q.price).toBe("64000");
  });

  test("refuses to fabricate an unseeded price (throws NoPriceAvailable)", async () => {
    const p = new InMemoryPriceProvider();
    await expect(p.currentPrice("ZZZZ", "twelve_data")).rejects.toBeInstanceOf(
      NoPriceAvailable,
    );
  });
});
