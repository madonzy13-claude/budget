import { describe, test, expect } from "bun:test";
import { MetalsDevPriceProvider } from "../../../src/adapters/price/metals-dev";
import { MetalsDailyOnlyError } from "../../../src/ports/price-provider";

function mockFetch(
  responder: () => { ok: boolean; status: number; body: unknown },
): { fn: typeof fetch; called: () => number } {
  let count = 0;
  const fn = (async () => {
    count += 1;
    const { ok, status, body } = responder();
    return { ok, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fn, called: () => count };
}

describe("MetalsDevPriceProvider (Pitfall 3 — daily only)", () => {
  test("daily context returns the parsed metal price", async () => {
    const { fn } = mockFetch(() => ({
      ok: true,
      status: 200,
      body: { metals: { gold: 2350.5, silver: 29.8 } },
    }));
    const provider = new MetalsDevPriceProvider("M_SECRET", fn);

    const quote = await provider.currentPrice("gold", "metals_dev", {
      context: "daily",
    });

    expect(quote.price).toBe("2350.5");
    expect(quote.currency).toBe("USD");
    expect(quote.provider).toBe("metals_dev");
  });

  test("hourly context throws MetalsDailyOnlyError WITHOUT calling fetch (quota guard)", async () => {
    const { fn, called } = mockFetch(() => ({
      ok: true,
      status: 200,
      body: { metals: { gold: 2350.5 } },
    }));
    const provider = new MetalsDevPriceProvider("M_SECRET", fn);

    await expect(
      provider.currentPrice("gold", "metals_dev", { context: "hourly" }),
    ).rejects.toBeInstanceOf(MetalsDailyOnlyError);
    expect(called()).toBe(0);
  });
});
