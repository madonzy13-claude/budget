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

  test("HTTP-429 on the first key fails over to the second key", async () => {
    let call = 0;
    const calls: string[] = [];
    const fn = (async (url: string) => {
      calls.push(String(url));
      call += 1;
      if (call === 1) return { ok: false, status: 429, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ price: "42.0" }) };
    }) as unknown as typeof fetch;

    const provider = new TwelveDataPriceProvider(["KEY_A", "KEY_B"], fn);
    const quote = await provider.currentPrice("AAPL", "twelve_data");

    expect(quote.price).toBe("42.0");
    expect(call).toBe(2);
    expect(calls[0]).toContain("apikey=KEY_A");
    expect(calls[1]).toContain("apikey=KEY_B");
  });

  test("200-with-code-429 (credits exhausted) also triggers failover", async () => {
    let call = 0;
    const fn = (async () => {
      call += 1;
      if (call === 1)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 429,
            status: "error",
            message: "credits",
          }),
        };
      return { ok: true, status: 200, json: async () => ({ price: "7.5" }) };
    }) as unknown as typeof fetch;

    const provider = new TwelveDataPriceProvider(["K1", "K2"], fn);
    const quote = await provider.currentPrice("MSFT", "twelve_data");
    expect(quote.price).toBe("7.5");
    expect(call).toBe(2);
  });

  test("all keys rate-limited throws NoPriceAvailable", async () => {
    const { fn } = mockFetch(() => ({ ok: false, status: 429, body: {} }));
    const provider = new TwelveDataPriceProvider(["K1", "K2"], fn);
    await expect(
      provider.currentPrice("AAPL", "twelve_data"),
    ).rejects.toBeInstanceOf(NoPriceAvailable);
  });

  test.each([-5, 0, "NaN", "Infinity", 1e13])(
    "insane upstream price %p throws NoPriceAvailable (never enters money math)",
    async (price) => {
      const { fn } = mockFetch(() => ({
        ok: true,
        status: 200,
        body: { price },
      }));
      const provider = new TwelveDataPriceProvider("KEY", fn);
      await expect(
        provider.currentPrice("AAPL", "twelve_data"),
      ).rejects.toBeInstanceOf(NoPriceAvailable);
    },
  );

  test("a valid price string passes through byte-identical", async () => {
    const { fn } = mockFetch(() => ({
      ok: true,
      status: 200,
      body: { price: "189.500" },
    }));
    const provider = new TwelveDataPriceProvider("KEY", fn);
    const quote = await provider.currentPrice("AAPL", "twelve_data");
    expect(quote.price).toBe("189.500"); // trailing zero preserved
  });
});
