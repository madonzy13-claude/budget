/**
 * metals-dev.ts — metals.dev price adapter (gold/silver). INV-12.
 * Pitfall 3 / T-9-09: 100 req/month free tier — DAILY ONLY. A call from the
 * hourly context throws MetalsDailyOnlyError BEFORE any fetch, bounding the call
 * rate to <=1/day. Fixed host (T-9-06); apiKey injected (T-9-07).
 */
import {
  type PriceProvider,
  type PriceQuote,
  type PriceContext,
  type ProviderId,
  NoPriceAvailable,
  MetalsDailyOnlyError,
} from "../../ports/price-provider";
import {
  sanePositiveNumber,
  assertBodyUnderCap,
  PRICE_BODY_CAP_BYTES,
} from "@budget/shared-kernel";

const METALS_DEV_HOST = "https://api.metals.dev";
const TIMEOUT_MS = 8000;

export class MetalsDevPriceProvider implements PriceProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async currentPrice(
    symbol: string,
    _provider: ProviderId = "metals_dev",
    opts?: { context?: PriceContext },
  ): Promise<PriceQuote> {
    // Quota guard: refuse the hourly cron before spending a request.
    if (opts?.context === "hourly") {
      throw new MetalsDailyOnlyError(symbol);
    }

    const url =
      `${METALS_DEV_HOST}/v1/latest` +
      `?api_key=${encodeURIComponent(this.apiKey)}` +
      `&currency=USD&unit=troy_ounce`;

    const res = await this.fetchFn(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new NoPriceAvailable(symbol, "metals_dev");
    try {
      assertBodyUnderCap(res, PRICE_BODY_CAP_BYTES);
    } catch {
      throw new NoPriceAvailable(symbol, "metals_dev");
    }

    const body = (await res.json()) as { metals?: Record<string, number> };
    const price = body.metals?.[symbol] ?? body.metals?.[symbol.toLowerCase()];
    if (price === undefined || price === null) {
      throw new NoPriceAvailable(symbol, "metals_dev");
    }
    try {
      sanePositiveNumber(price);
    } catch {
      throw new NoPriceAvailable(symbol, "metals_dev");
    }

    return {
      price: String(price), // ACL: number -> string
      currency: "USD",
      provider: "metals_dev",
      fetchedAt: new Date(),
    };
  }
}
