/**
 * finnhub.ts — Finnhub price adapter (US equities/ETF). INV-12.
 * Free tier: 60 req/min, no daily cap — used for US-listed symbols; non-US
 * markets stay on Twelve Data. Fixed host (T-9-06); symbol URL-encoded; token
 * injected via constructor (T-9-07). Accepts multiple keys, fails over on 429.
 *
 * GET /api/v1/quote?symbol=AAPL&token=KEY → { c: current, d, dp, h, l, o, pc, t }.
 * Finnhub returns c=0 for unknown / no-data symbols → treated as NoPriceAvailable.
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
import {
  sanePositiveNumber,
  assertBodyUnderCap,
  PRICE_BODY_CAP_BYTES,
} from "@budget/shared-kernel";

const FINNHUB_HOST = "https://finnhub.io";
const TIMEOUT_MS = 8000;

export class FinnhubPriceProvider implements PriceProvider {
  private readonly keys: string[];
  constructor(
    keys: string | string[],
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.keys = normalizeKeys(keys);
  }

  async currentPrice(
    symbol: string,
    _provider: ProviderId = "finnhub",
  ): Promise<PriceQuote> {
    return withKeyFailover(this.keys, symbol, "finnhub", async (token) => {
      const url =
        `${FINNHUB_HOST}/api/v1/quote` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&token=${encodeURIComponent(token)}`;

      const res = await this.fetchFn(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429) throw new RateLimited("finnhub");
      if (!res.ok) throw new NoPriceAvailable(symbol, "finnhub");
      try {
        assertBodyUnderCap(res, PRICE_BODY_CAP_BYTES);
      } catch {
        throw new NoPriceAvailable(symbol, "finnhub");
      }

      const body = (await res.json()) as { c?: number };
      // c === 0 (or absent) means Finnhub has no quote for the symbol.
      if (body.c === undefined || body.c === null || body.c === 0) {
        throw new NoPriceAvailable(symbol, "finnhub");
      }
      try {
        sanePositiveNumber(body.c);
      } catch {
        throw new NoPriceAvailable(symbol, "finnhub");
      }

      return {
        price: String(body.c), // ACL: number -> string
        currency: "USD",
        provider: "finnhub",
        fetchedAt: new Date(),
      };
    });
  }
}
