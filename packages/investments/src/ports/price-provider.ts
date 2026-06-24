/**
 * price-provider.ts — PriceProvider port (Phase 9, INV-12).
 * Mirrors shared-kernel FxProvider: an interface + an InMemory stub that refuses
 * to fabricate a price. NO drizzle / HTTP here — adapters implement it.
 *
 * ACL: `price` is always a string (number->string at the adapter boundary) so a
 * JS float never crosses into the domain math (T-9-04).
 */
export type ProviderId =
  | "twelve_data"
  | "coingecko"
  | "metals_dev"
  | "finnhub"
  | "gold_api";

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

/**
 * Internal control-flow signal: a provider hit its rate/credit limit with the
 * current key. `withKeyFailover` catches it to advance to the next key; if every
 * key is exhausted it surfaces as NoPriceAvailable so upstream handling (blocked
 * banner / job `failed` counter) is unchanged.
 */
export class RateLimited extends Error {
  constructor(public readonly provider: string) {
    super(`Rate limited by ${provider}`);
    this.name = "RateLimited";
  }
}

/**
 * Resolve a provider key config from env: prefer the CSV `*_API_KEYS`, else the
 * single `*_API_KEY`. Uses non-empty selection (NOT `??`) so an empty-string
 * `*_API_KEYS` placeholder doesn't shadow a populated single key — that shadowing
 * made every price come back price_unavailable (T-9 UAT).
 */
export function resolveApiKey(
  csv: string | undefined,
  single: string | undefined,
): string {
  return csv || single || "";
}

/** Normalize a key config (single string, CSV string, or array) to a clean list. */
export function normalizeKeys(keys: string | string[]): string[] {
  const arr = Array.isArray(keys) ? keys : [keys];
  return arr
    .flatMap((k) => (k ?? "").split(","))
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Try each key in order; advance to the next ONLY when `attempt` throws
 * RateLimited. Any other error propagates immediately (a missing symbol won't be
 * fixed by another key). When every key is rate-limited — or no keys are
 * configured — throw NoPriceAvailable so callers keep their existing behaviour.
 */
export async function withKeyFailover<T>(
  keys: string[],
  symbol: string,
  provider: string,
  attempt: (key: string) => Promise<T>,
): Promise<T> {
  // Keyless attempt still runs once so the provider's own error surfaces.
  const usable = keys.length > 0 ? keys : [""];
  for (let i = 0; i < usable.length; i++) {
    try {
      return await attempt(usable[i]!);
    } catch (e) {
      if (e instanceof RateLimited && i < usable.length - 1) continue;
      if (e instanceof RateLimited)
        throw new NoPriceAvailable(symbol, provider);
      throw e;
    }
  }
  throw new NoPriceAvailable(symbol, provider);
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
