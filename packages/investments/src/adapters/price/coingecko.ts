/**
 * coingecko.ts — CoinGecko price adapter (crypto). INV-12.
 * Fixed host (T-9-06); coin id URL-encoded; demo key sent as the x-cg-demo-api-key
 * header, injected via constructor (T-9-07 — never reads env vars directly, never
 * logged). Accepts multiple keys and fails over on HTTP 429.
 */
import {
  type PriceProvider,
  type PriceQuote,
  type ProviderId,
  NoPriceAvailable,
  RateLimited,
  normalizeKeys,
  withKeyFailover,
} from "../../ports/price-provider";

const COINGECKO_HOST = "https://api.coingecko.com";
const TIMEOUT_MS = 8000;

export class CoinGeckoPriceProvider implements PriceProvider {
  private readonly keys: string[];
  constructor(
    keys: string | string[],
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.keys = normalizeKeys(keys);
  }

  async currentPrice(
    id: string,
    _provider: ProviderId = "coingecko",
  ): Promise<PriceQuote> {
    return withKeyFailover(this.keys, id, "coingecko", async (apiKey) => {
      const url =
        `${COINGECKO_HOST}/api/v3/simple/price` +
        `?ids=${encodeURIComponent(id)}&vs_currencies=usd`;

      const res = await this.fetchFn(url, {
        headers: { "x-cg-demo-api-key": apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429) throw new RateLimited("coingecko");
      if (!res.ok) throw new NoPriceAvailable(id, "coingecko");

      const body = (await res.json()) as Record<string, { usd?: number }>;
      const usd = body[id]?.usd;
      if (usd === undefined || usd === null) {
        throw new NoPriceAvailable(id, "coingecko");
      }

      return {
        price: String(usd), // ACL: number -> string
        currency: "USD",
        provider: "coingecko",
        fetchedAt: new Date(),
      };
    });
  }
}
