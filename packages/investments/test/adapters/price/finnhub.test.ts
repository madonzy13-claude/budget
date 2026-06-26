import { describe, test, expect } from "bun:test";
import { FinnhubPriceProvider } from "../../../src/adapters/price/finnhub";
import { NoPriceAvailable } from "../../../src/ports/price-provider";

function mockFetch(
  responder: (call: number) => { ok: boolean; status: number; body: unknown },
): { fn: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  let n = 0;
  const fn = (async (url: string) => {
    calls.push(String(url));
    n += 1;
    const { ok, status, body } = responder(n);
    return { ok, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("FinnhubPriceProvider", () => {
  test("currentPrice reads { c } from /quote with the token + symbol", async () => {
    const { fn, calls } = mockFetch(() => ({
      ok: true,
      status: 200,
      body: { c: 259.45, pc: 255 },
    }));
    const provider = new FinnhubPriceProvider("FH_KEY", fn);

    const quote = await provider.currentPrice("AAPL", "finnhub");

    expect(quote.price).toBe("259.45");
    expect(quote.currency).toBe("USD");
    expect(quote.provider).toBe("finnhub");
    expect(calls[0]).toContain("finnhub.io");
    expect(calls[0]).toContain("symbol=AAPL");
    expect(calls[0]).toContain("token=FH_KEY");
  });

  test("c === 0 (no data) throws NoPriceAvailable", async () => {
    const { fn } = mockFetch(() => ({ ok: true, status: 200, body: { c: 0 } }));
    const provider = new FinnhubPriceProvider("FH_KEY", fn);
    await expect(
      provider.currentPrice("ZZZZ", "finnhub"),
    ).rejects.toBeInstanceOf(NoPriceAvailable);
  });

  test("HTTP 429 on the first key fails over to the second", async () => {
    const { fn, calls } = mockFetch((n) =>
      n === 1
        ? { ok: false, status: 429, body: {} }
        : { ok: true, status: 200, body: { c: 100 } },
    );
    const provider = new FinnhubPriceProvider(["A", "B"], fn);
    const quote = await provider.currentPrice("MSFT", "finnhub");
    expect(quote.price).toBe("100");
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("token=A");
    expect(calls[1]).toContain("token=B");
  });
});
