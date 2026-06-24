import { describe, test, expect } from "bun:test";
import {
  InMemoryPriceProvider,
  NoPriceAvailable,
  resolveApiKey,
} from "../../src/ports/price-provider";

describe("resolveApiKey (env key selection)", () => {
  test("an EMPTY-STRING CSV placeholder falls through to the single key", () => {
    // The T-9 UAT bug: FINNHUB_API_KEYS="" shadowed a populated FINNHUB_API_KEY.
    expect(resolveApiKey("", "single-key")).toBe("single-key");
  });
  test("prefers the CSV when present", () => {
    expect(resolveApiKey("a,b", "single-key")).toBe("a,b");
  });
  test("undefined CSV falls through to the single key", () => {
    expect(resolveApiKey(undefined, "single-key")).toBe("single-key");
  });
  test("both empty/undefined → empty string", () => {
    expect(resolveApiKey("", undefined)).toBe("");
    expect(resolveApiKey(undefined, undefined)).toBe("");
  });
});

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
