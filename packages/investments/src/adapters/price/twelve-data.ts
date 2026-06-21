/**
 * twelve-data.ts — Twelve Data price adapter (equities/ETF/FX). INV-12.
 * Fixed host (T-9-06 SSRF guard); symbol URL-encoded into the query, never the host.
 * apiKey injected via constructor (T-9-07 — never reads env vars directly, never logged).
 */
import {
  type PriceProvider,
  type PriceQuote,
  type ProviderId,
  NoPriceAvailable,
} from "../../ports/price-provider";

const TWELVE_DATA_HOST = "https://api.twelvedata.com";
const TIMEOUT_MS = 8000;

export class TwelveDataPriceProvider implements PriceProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async currentPrice(
    symbol: string,
    _provider: ProviderId = "twelve_data",
  ): Promise<PriceQuote> {
    const url =
      `${TWELVE_DATA_HOST}/price` +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&apikey=${encodeURIComponent(this.apiKey)}`;

    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new NoPriceAvailable(symbol, "twelve_data");

    const body = (await res.json()) as { price?: string | number };
    if (body.price === undefined || body.price === null) {
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
  }
}
