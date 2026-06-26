/**
 * price-cache-repo.ts — PriceCacheRepo port (Phase 9).
 * Latest fetched price per instrument (budgeting.instrument_price_cache).
 * Reference data, no tenant scope. NO drizzle here — the adapter implements it.
 */
export interface CachedPrice {
  price: string; // numeric(28,8) as string
  currency: string;
  fetchedAt: Date;
}

export interface PriceCacheRepo {
  lookup(instrumentId: string): Promise<CachedPrice | null>;
  upsert(instrumentId: string, price: string, currency: string): Promise<void>;
}
