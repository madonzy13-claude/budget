/**
 * fetch-instrument-price.test.ts — on-add price fetch read-through cache (T-9).
 *
 * The on-add fetch must serve a RECENT cached price without calling the provider
 * or charging the per-user rate limit, so repeated lookups (same instrument, any
 * user) don't exhaust the shared provider quota. A stale/absent cache falls back
 * to a rate-limited provider call that re-populates the cache.
 */
import { describe, test, expect } from "bun:test";
import { fetchInstrumentPrice } from "../../src/application/fetch-instrument-price";
import type { InstrumentSearchResult } from "../../src/ports/instrument-repo";
import type { CachedPrice } from "../../src/ports/price-cache-repo";

const INST: InstrumentSearchResult = {
  id: "11111111-1111-1111-1111-111111111111",
  symbol: "AAPL",
  displayName: "Apple Inc.",
  assetClass: "equities",
  quoteCurrency: "USD",
  provider: "finnhub",
  refreshCadence: "hourly",
  rank: 100,
};

function makeDeps(opts: { cached: CachedPrice | null }) {
  const calls = { providerCalls: 0, rateLimitQueries: 0, upserts: 0 };
  const deps = {
    pool: {
      query: async () => {
        calls.rateLimitQueries++;
        return { rows: [{ count: 1 }] };
      },
    } as never,
    priceProvider: {
      currentPrice: async () => {
        calls.providerCalls++;
        return {
          price: "298.00",
          currency: "USD",
          provider: "finnhub",
          fetchedAt: new Date(),
        };
      },
    } as never,
    instrumentRepo: {
      findById: async () => INST,
    } as never,
    priceCacheRepo: {
      lookup: async () => opts.cached,
      upsert: async () => {
        calls.upserts++;
      },
    } as never,
    // USD → PLN = 4.0 (metals FX conversion).
    fxProvider: {
      rateAsOf: async () => ({ rate: "4", provider: "stub", isStale: false }),
    } as never,
  };
  return { deps, calls };
}

describe("fetchInstrumentPrice — read-through cache", () => {
  test("a FRESH cache hit serves the cached price with no provider call / no rate-limit charge", async () => {
    const { deps, calls } = makeDeps({
      cached: { price: "297.50", currency: "USD", fetchedAt: new Date() },
    });
    const res = await fetchInstrumentPrice(deps)({
      instrumentId: INST.id,
      userId: "u1",
    });
    expect(res.isOk()).toBe(true);
    expect(res._unsafeUnwrap()).toEqual({ price: "297.50", currency: "USD" });
    expect(calls.providerCalls).toBe(0);
    expect(calls.rateLimitQueries).toBe(0);
  });

  test("no cache → calls the provider, charges the rate limit, and caches the result", async () => {
    const { deps, calls } = makeDeps({ cached: null });
    const res = await fetchInstrumentPrice(deps)({
      instrumentId: INST.id,
      userId: "u1",
    });
    expect(res.isOk()).toBe(true);
    expect(res._unsafeUnwrap()).toEqual({ price: "298.00", currency: "USD" });
    expect(calls.providerCalls).toBe(1);
    expect(calls.rateLimitQueries).toBe(1);
    expect(calls.upserts).toBe(1);
  });

  test("a manual-provider instrument (incl. exchange-qualified) never calls the provider or charges the rate limit", async () => {
    const { deps, calls } = makeDeps({ cached: null });
    deps.instrumentRepo = {
      findById: async () => ({ ...INST, provider: "manual:XWAR" }),
    } as never;
    const res = await fetchInstrumentPrice(deps)({
      instrumentId: INST.id,
      userId: "u1",
    });
    expect(res.isErr()).toBe(true);
    expect(res._unsafeUnwrapErr().message).toBe("manual_pricing");
    expect(calls.providerCalls).toBe(0);
    expect(calls.rateLimitQueries).toBe(0);
    expect(calls.upserts).toBe(0);
  });

  test("targetCurrency converts the (USD) price via FX — metals shown in the user's currency", async () => {
    const { deps } = makeDeps({
      cached: { price: "2000.00", currency: "USD", fetchedAt: new Date() },
    });
    const res = await fetchInstrumentPrice(deps)({
      instrumentId: INST.id,
      userId: "u1",
      targetCurrency: "PLN",
    });
    expect(res.isOk()).toBe(true);
    // 2000 USD × 4.0 = 8000 PLN.
    expect(res._unsafeUnwrap()).toEqual({
      price: "8000.00000000",
      currency: "PLN",
    });
  });

  test("targetCurrency equal to the quote currency does NOT convert", async () => {
    const { deps } = makeDeps({
      cached: { price: "2000.00", currency: "USD", fetchedAt: new Date() },
    });
    const res = await fetchInstrumentPrice(deps)({
      instrumentId: INST.id,
      userId: "u1",
      targetCurrency: "USD",
    });
    expect(res._unsafeUnwrap()).toEqual({ price: "2000.00", currency: "USD" });
  });

  test("a STALE cache entry (older than the TTL) refetches from the provider", async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const { deps, calls } = makeDeps({
      cached: { price: "100.00", currency: "USD", fetchedAt: fourHoursAgo },
    });
    const res = await fetchInstrumentPrice(deps)({
      instrumentId: INST.id,
      userId: "u1",
    });
    expect(res.isOk()).toBe(true);
    expect(res._unsafeUnwrap().price).toBe("298.00");
    expect(calls.providerCalls).toBe(1);
  });
});
