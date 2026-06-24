/**
 * gold-api.test.ts — GoldApiPriceProvider (free keyless metals spot). INV-12.
 * Free Twelve Data prices only gold; this covers silver + platinum too. The HTTP
 * layer is exercised via an injected fake fetch (no network).
 */
import { describe, it, expect } from "bun:test";
import { GoldApiPriceProvider } from "../../../src/adapters/price/gold-api";
import { NoPriceAvailable } from "../../../src/ports/price-provider";

function fakeFetch(map: Record<string, number>): typeof fetch {
  return (async (url: string) => {
    const metal = String(url).split("/price/")[1];
    const price = map[metal];
    if (price === undefined) return new Response("not found", { status: 404 });
    return new Response(
      JSON.stringify({ price, currency: "USD", symbol: metal }),
      {
        status: 200,
      },
    );
  }) as unknown as typeof fetch;
}

describe("GoldApiPriceProvider", () => {
  const fetchFn = fakeFetch({ XAU: 4010.1, XAG: 58.747, XPT: 1594 });

  it("prices silver (XAG/USD) — the case Twelve Data free can't", async () => {
    const p = new GoldApiPriceProvider(fetchFn);
    const q = await p.currentPrice("XAG/USD");
    expect(q.price).toBe("58.747");
    expect(q.currency).toBe("USD");
    expect(q.provider).toBe("gold_api");
  });

  it("prices platinum (XPT/USD)", async () => {
    const p = new GoldApiPriceProvider(fetchFn);
    expect((await p.currentPrice("XPT/USD")).price).toBe("1594");
  });

  it("strips the /USD suffix to the bare metal code in the path", async () => {
    let seen = "";
    const probe = (async (url: string) => {
      seen = String(url);
      return new Response(JSON.stringify({ price: 4010.1 }), { status: 200 });
    }) as unknown as typeof fetch;
    await new GoldApiPriceProvider(probe).currentPrice("XAU/USD");
    expect(seen).toContain("/price/XAU");
    expect(seen).not.toContain("XAU/USD");
  });

  it("throws NoPriceAvailable on a non-200", async () => {
    const p = new GoldApiPriceProvider(fakeFetch({}));
    await expect(p.currentPrice("XAG/USD")).rejects.toBeInstanceOf(
      NoPriceAvailable,
    );
  });
});
