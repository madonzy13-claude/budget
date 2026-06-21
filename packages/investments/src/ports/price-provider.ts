/**
 * price-provider.ts — PriceProvider port (Phase 9, INV-12).
 * Mirrors shared-kernel FxProvider: an interface + an InMemory stub that refuses
 * to fabricate a price. NO drizzle / HTTP here — adapters implement it.
 *
 * ACL: `price` is always a string (number->string at the adapter boundary) so a
 * JS float never crosses into the domain math (T-9-04).
 */
export type ProviderId = "twelve_data" | "coingecko" | "metals_dev";

/** Pitfall 3: metals.dev is gated to the daily refresh only (100 req/month tier). */
export type PriceContext = "hourly" | "daily";

export interface PriceQuote {
  price: string;
  currency: string;
  provider: string;
  fetchedAt: Date;
}

export interface PriceProvider {
  currentPrice(
    symbol: string,
    provider: ProviderId,
    opts?: { context?: PriceContext },
  ): Promise<PriceQuote>;
  /** Optional — local search lives in InstrumentRepo (D-04); providers never search. */
  searchInstruments?(
    query: string,
    limit?: number,
  ): Promise<
    Array<{ symbol: string; displayName: string; assetClass: string }>
  >;
}

/** Thrown when a provider cannot return a live price (http error / missing field). */
export class NoPriceAvailable extends Error {
  constructor(
    public readonly symbol: string,
    public readonly provider: string,
  ) {
    super(`No price available for ${symbol} from ${provider}`);
    this.name = "NoPriceAvailable";
  }
}

/** T-9-09: metals.dev must never be called from the hourly cron (quota guard). */
export class MetalsDailyOnlyError extends Error {
  constructor(public readonly symbol: string) {
    super(
      `metals.dev is daily-only (100 req/month tier) — refused hourly fetch for ${symbol}`,
    );
    this.name = "MetalsDailyOnlyError";
  }
}

/**
 * Test stub. Like InMemoryFxProvider, it refuses to fabricate: an unseeded symbol
 * throws NoPriceAvailable rather than silently returning a zero/one price.
 */
export class InMemoryPriceProvider implements PriceProvider {
  constructor(
    private readonly fixed: Record<
      string,
      { price: string; currency: string }
    > = {},
  ) {}

  async currentPrice(
    symbol: string,
    provider: ProviderId,
    _opts?: { context?: PriceContext },
  ): Promise<PriceQuote> {
    const hit = this.fixed[symbol] ?? this.fixed[`${provider}:${symbol}`];
    if (!hit) throw new NoPriceAvailable(symbol, provider);
    return {
      price: hit.price,
      currency: hit.currency,
      provider,
      fetchedAt: new Date(0),
    };
  }
}
