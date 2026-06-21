import { describe, test, expect } from "bun:test";
import { TwelveDataPriceProvider } from "../../../src/adapters/price/twelve-data";
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
    return {
      ok,
      status,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("TwelveDataPriceProvider", () => {
  test("currentPrice fetches the fixed host with the URL-encoded symbol", async () => {
    const { fn, calls } = mockFetch(() => ({
      ok: true,
      status: 200,
      body: { price: "189.50" },
    }));
    const provider = new TwelveDataPriceProvider("SECRET_KEY", fn);

    const quote = await provider.currentPrice("AAPL", "twelve_data");

    expect(quote.price).toBe("189.50");
    expect(quote.provider).toBe("twelve_data");
    expect(quote.currency).toBe("USD");
    expect(calls[0].url).toContain("api.twelvedata.com");
    expect(calls[0].url).toContain("symbol=AAPL");
  });

  test("http 429 throws NoPriceAvailable (no silent zero)", async () => {
    const { fn } = mockFetch(() => ({ ok: false, status: 429, body: {} }));
    const provider = new TwelveDataPriceProvider("SECRET_KEY", fn);
    await expect(
      provider.currentPrice("AAPL", "twelve_data"),
    ).rejects.toBeInstanceOf(NoPriceAvailable);
  });

  test("a missing price field throws NoPriceAvailable", async () => {
    const { fn } = mockFetch(() => ({ ok: true, status: 200, body: {} }));
    const provider = new TwelveDataPriceProvider("SECRET_KEY", fn);
    await expect(
      provider.currentPrice("AAPL", "twelve_data"),
    ).rejects.toBeInstanceOf(NoPriceAvailable);
  });
});
