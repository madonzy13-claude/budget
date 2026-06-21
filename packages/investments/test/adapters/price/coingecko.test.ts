import { describe, test, expect } from "bun:test";
import { CoinGeckoPriceProvider } from "../../../src/adapters/price/coingecko";
import { NoPriceAvailable } from "../../../src/ports/price-provider";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockFetch(
  responder: () => { ok: boolean; status: number; body: unknown },
): { fn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const { ok, status, body } = responder();
    return { ok, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function headerValue(
  init: RequestInit | undefined,
  key: string,
): string | null {
  const h = init?.headers;
  if (!h) return null;
  if (h instanceof Headers) return h.get(key);
  return (h as Record<string, string>)[key] ?? null;
}

describe("CoinGeckoPriceProvider", () => {
  test("currentPrice parses {id:{usd}} and sends the demo-api-key header", async () => {
    const { fn, calls } = mockFetch(() => ({
      ok: true,
      status: 200,
      body: { bitcoin: { usd: 64000 } },
    }));
    const provider = new CoinGeckoPriceProvider("CG_SECRET", fn);

    const quote = await provider.currentPrice("bitcoin", "coingecko");

    expect(quote.price).toBe("64000");
    expect(quote.currency).toBe("USD");
    expect(quote.provider).toBe("coingecko");
    expect(calls[0].url).toContain("api.coingecko.com");
    expect(calls[0].url).toContain("ids=bitcoin");
    expect(headerValue(calls[0].init, "x-cg-demo-api-key")).toBe("CG_SECRET");
  });

  test("missing id in the response throws NoPriceAvailable", async () => {
    const { fn } = mockFetch(() => ({ ok: true, status: 200, body: {} }));
    const provider = new CoinGeckoPriceProvider("CG_SECRET", fn);
    await expect(
      provider.currentPrice("bitcoin", "coingecko"),
    ).rejects.toBeInstanceOf(NoPriceAvailable);
  });
});
