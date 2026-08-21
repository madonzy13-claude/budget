import { describe, test, expect } from "bun:test";
import { CacheOnlyFxProvider } from "../src/adapters/fx/cache-only";
import { NoFxRateAvailable } from "../src/adapters/fx/frankfurter";
import type { FxRateCacheRepo } from "../src/ports/fx-rate-cache-repo";

/**
 * The API must never perform a live FX fetch. FrankfurterFxProvider falls back
 * to https://api.frankfurter.dev on a cache miss, and boot.ts handed that same
 * provider to every API use case — so a user request could block on a third
 * party. Rates are refreshed hourly by the worker; the API reads only.
 */

function fakeCache(over: Partial<FxRateCacheRepo> = {}): FxRateCacheRepo {
  return {
    lookup: async () => null,
    upsert: async () => {},
    mostRecentPrior: async () => null,
    ...over,
  };
}

const WEEKDAY = new Date("2026-08-17T12:00:00Z"); // Monday
const WEEKEND = new Date("2026-08-16T12:00:00Z"); // Sunday

describe("CacheOnlyFxProvider", () => {
  test("never calls the network — there is no fetch dependency to inject", () => {
    // Constructor takes ONLY the cache. If a fetch ever needs passing in, this
    // provider has stopped being cache-only.
    expect(CacheOnlyFxProvider.length).toBe(1);
  });

  test("same currency short-circuits to 1 without touching the cache", async () => {
    let touched = false;
    const provider = new CacheOnlyFxProvider(
      fakeCache({
        lookup: async () => {
          touched = true;
          return null;
        },
      }),
    );

    expect(await provider.rateAsOf("EUR", "EUR", WEEKDAY)).toEqual({
      rate: "1",
      provider: "cache",
      isStale: false,
    });
    expect(touched).toBe(false);
  });

  test("serves an exact cache hit as fresh", async () => {
    const provider = new CacheOnlyFxProvider(
      fakeCache({ lookup: async () => ({ rate: "4.25", date: "2026-08-17" }) }),
    );

    const r = await provider.rateAsOf("EUR", "PLN", WEEKDAY);
    expect(r.rate).toBe("4.25");
    expect(r.isStale).toBe(false);
  });

  test("marks a weekend rate stale — Fridays value is served for Sat/Sun", async () => {
    const provider = new CacheOnlyFxProvider(
      fakeCache({ lookup: async () => ({ rate: "4.25", date: "2026-08-16" }) }),
    );

    expect((await provider.rateAsOf("EUR", "PLN", WEEKEND)).isStale).toBe(true);
  });

  test("falls back to the most recent prior rate, flagged stale", async () => {
    const provider = new CacheOnlyFxProvider(
      fakeCache({
        lookup: async () => null,
        mostRecentPrior: async () => ({ rate: "4.10", date: "2026-08-14" }),
      }),
    );

    const r = await provider.rateAsOf("EUR", "PLN", WEEKDAY);
    expect(r.rate).toBe("4.10");
    expect(r.isStale).toBe(true);
  });

  test("throws NoFxRateAvailable when nothing is cached — it must not invent a rate", async () => {
    const provider = new CacheOnlyFxProvider(fakeCache());

    // Silently returning 1 here would book a foreign amount at par. The
    // codebase has already been burned by exactly that (see InMemoryFxProvider).
    await expect(provider.rateAsOf("EUR", "PLN", WEEKDAY)).rejects.toBeInstanceOf(
      NoFxRateAvailable,
    );
  });

  test("never writes to the cache — only the worker populates rates", async () => {
    let wrote = false;
    const provider = new CacheOnlyFxProvider(
      fakeCache({
        lookup: async () => ({ rate: "4.25", date: "2026-08-17" }),
        upsert: async () => {
          wrote = true;
        },
      }),
    );

    await provider.rateAsOf("EUR", "PLN", WEEKDAY);
    expect(wrote).toBe(false);
  });
});
