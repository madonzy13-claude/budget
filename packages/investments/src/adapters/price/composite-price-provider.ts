/**
 * composite-price-provider.ts — routes currentPrice by provider id (INV-12).
 * Dispatches to twelve_data | coingecko | metals_dev; the metals route carries the
 * daily/hourly context so MetalsDailyOnlyError still fires for the hourly cron.
 */
import {
  type PriceProvider,
  type PriceQuote,
  type PriceContext,
  type ProviderId,
  NoPriceAvailable,
} from "../../ports/price-provider";

export class CompositePriceProvider implements PriceProvider {
  constructor(
    private readonly providers: Partial<Record<ProviderId, PriceProvider>>,
  ) {}

  async currentPrice(
    symbol: string,
    provider: ProviderId,
    opts?: { context?: PriceContext },
  ): Promise<PriceQuote> {
    const impl = this.providers[provider];
    if (!impl) throw new NoPriceAvailable(symbol, provider);
    return impl.currentPrice(symbol, provider, opts);
  }
}
