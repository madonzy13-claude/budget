/**
 * gold-api.ts — precious-metals spot adapter (gold-api.com). INV-12.
 *
 * Twelve Data's free tier prices ONLY gold (XAU/USD); silver + platinum need the
 * paid Grow plan, and Finnhub's free tier has no metals at all. gold-api.com is a
 * free, KEYLESS source for XAU/XAG/XPT in USD — so all three metals auto-price on
 * the free stack. Fixed host (T-9-06 SSRF guard); the metal code is URL-encoded
 * into the path, never the host.
 *
 * Spot instruments are seeded as "XAU/USD" etc.; gold-api keys on the bare metal
 * code (XAU), so the "/USD" suffix is stripped. Price is per troy ounce, USD.
 */
import {
  type PriceProvider,
  type PriceQuote,
  type ProviderId,
  NoPriceAvailable,
} from "../../ports/price-provider";
import {
  sanePositiveNumber,
  assertBodyUnderCap,
  PRICE_BODY_CAP_BYTES,
} from "@budget/shared-kernel";

const GOLD_API_HOST = "https://api.gold-api.com";
const TIMEOUT_MS = 8000;

export class GoldApiPriceProvider implements PriceProvider {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async currentPrice(
    symbol: string,
    _provider: ProviderId = "gold_api",
  ): Promise<PriceQuote> {
    const metal = symbol.split("/")[0]; // "XAU/USD" -> "XAU"
    const res = await this.fetchFn(
      `${GOLD_API_HOST}/price/${encodeURIComponent(metal)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) throw new NoPriceAvailable(symbol, "gold_api");
    try {
      assertBodyUnderCap(res, PRICE_BODY_CAP_BYTES);
    } catch {
      throw new NoPriceAvailable(symbol, "gold_api");
    }

    const body = (await res.json()) as { price?: number };
    if (body.price === undefined || body.price === null) {
      throw new NoPriceAvailable(symbol, "gold_api");
    }
    try {
      sanePositiveNumber(body.price);
    } catch {
      throw new NoPriceAvailable(symbol, "gold_api");
    }
    return {
      price: String(body.price), // ACL: number -> string
      currency: "USD",
      provider: "gold_api",
      fetchedAt: new Date(),
    };
  }
}
