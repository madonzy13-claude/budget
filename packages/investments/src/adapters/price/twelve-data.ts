/**
 * twelve-data.ts — Twelve Data price adapter (non-US equities/ETF + FX metals). INV-12.
 * Fixed host (T-9-06 SSRF guard); symbol URL-encoded into the query, never the host.
 * Keys injected via constructor (T-9-07 — never reads env vars directly, never logged);
 * accepts multiple keys and fails over to the next one on a rate/credit limit.
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

const TWELVE_DATA_HOST = "https://api.twelvedata.com";
const TIMEOUT_MS = 8000;

export class TwelveDataPriceProvider implements PriceProvider {
  private readonly keys: string[];
  constructor(
    keys: string | string[],
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.keys = normalizeKeys(keys);
  }

  async currentPrice(
    symbol: string,
    _provider: ProviderId = "twelve_data",
  ): Promise<PriceQuote> {
    return withKeyFailover(this.keys, symbol, "twelve_data", async (apiKey) => {
      const url =
        `${TWELVE_DATA_HOST}/price` +
        `?symbol=${encodeURIComponent(symbol)}` +
        `&apikey=${encodeURIComponent(apiKey)}`;

      const res = await this.fetchFn(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429) throw new RateLimited("twelve_data");
      if (!res.ok) throw new NoPriceAvailable(symbol, "twelve_data");
      try {
        assertBodyUnderCap(res, PRICE_BODY_CAP_BYTES);
      } catch {
        throw new NoPriceAvailable(symbol, "twelve_data");
      }

      const body = (await res.json()) as {
        price?: string | number;
        code?: number;
        status?: string;
        message?: string;
      };
      // TD returns HTTP 200 with a JSON error body when credits run out.
      if (
        body.code === 429 ||
        (body.status === "error" && /credit|limit/i.test(body.message ?? ""))
      ) {
        throw new RateLimited("twelve_data");
      }
      if (body.price === undefined || body.price === null) {
        throw new NoPriceAvailable(symbol, "twelve_data");
      }
      try {
        sanePositiveNumber(Number(body.price));
      } catch {
        throw new NoPriceAvailable(symbol, "twelve_data");
      }

      // Currency is the instrument's quote_currency (default USD); the use-case
      // reconciles against instruments.quote_currency since /price omits it.
      return {
        price: String(body.price), // ACL: number -> string at the boundary
        currency: "USD",
        provider: "twelve_data",
        fetchedAt: new Date(),
      };
    });
  }
}
