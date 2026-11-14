/**
 * Unit tests for FrankfurterFxProvider (ENGR-09 ACL).
 * TDD RED: uses in-memory fake cache + mocked fetchFn.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  FrankfurterFxProvider,
  NoFxRateAvailable,
} from "../src/adapters/fx/frankfurter";
import type { FxRateCacheRepo } from "../src/ports/fx-rate-cache-repo";

// In-memory fake FxRateCacheRepo
class FakeFxRateCacheRepo implements FxRateCacheRepo {
  private store = new Map<string, { rate: string; date: string }>();
  private priors = new Map<string, { rate: string; date: string }[]>();

  setLookup(base: string, quote: string, date: string, rate: string) {
    this.store.set(`${base}/${quote}/${date}`, { rate, date });
  }

  setPrior(
    base: string,
    quote: string,
    result: { rate: string; date: string } | null,
  ) {
    if (result) this.priors.set(`${base}/${quote}`, [result]);
    else this.priors.delete(`${base}/${quote}`);
  }

  async lookup(base: string, quote: string, date: string) {
    return this.store.get(`${base}/${quote}/${date}`) ?? null;
  }

  upsertCalls: Array<{
    base: string;
    quote: string;
    date: string;
    rate: string;
    provider: string;
  }> = [];

  async upsert(
    base: string,
    quote: string,
    date: string,
    rate: string,
    provider: string,
  ) {
    this.store.set(`${base}/${quote}/${date}`, { rate, date });
    this.upsertCalls.push({ base, quote, date, rate, provider });
  }

  async mostRecentPrior(base: string, quote: string, _beforeDate: string) {
    const list = this.priors.get(`${base}/${quote}`);
    return list?.[0] ?? null;
  }
}

// Bun's `typeof fetch` carries extra members (e.g. `preconnect`) that these
// stubs deliberately do not implement, so each one is cast through `unknown`.
function makeFetch(status: number, body: unknown): typeof fetch {
  return (async (_url: string | URL | Request) => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

function makeFailingFetch(): typeof fetch {
  return (async (_url: string | URL | Request) => {
    throw new Error("Network error");
  }) as unknown as typeof fetch;
}

let cache: FakeFxRateCacheRepo;
const TODAY = new Date("2026-05-08T12:00:00Z"); // Friday — not a weekend, so isStale=false for fresh cache hit

beforeEach(() => {
  cache = new FakeFxRateCacheRepo();
});

describe("FrankfurterFxProvider", () => {
  test("same currency: returns rate=1 immediately without fetch", async () => {
    let fetchCalled = false;
    const fetchFn = async () => {
      fetchCalled = true;
      return {} as Response;
    };
    const provider = new FrankfurterFxProvider(
      cache,
      fetchFn as unknown as typeof fetch,
    );
    const result = await provider.rateAsOf("USD", "USD", TODAY);
    expect(result.rate).toBe("1");
    expect(result.isStale).toBe(false);
    expect(result.provider).toBe("frankfurter");
    expect(fetchCalled).toBe(false);
  });

  test("cache hit fresh: returns cached rate with isStale=false", async () => {
    cache.setLookup("USD", "EUR", "2026-05-08", "0.85");
    const provider = new FrankfurterFxProvider(cache, makeFailingFetch());
    const result = await provider.rateAsOf("USD", "EUR", TODAY);
    expect(result.rate).toBe("0.85");
    expect(result.isStale).toBe(false);
    expect(result.provider).toBe("frankfurter");
  });

  test("cache hit stale: returns cached rate with isStale=true when dates differ", async () => {
    // cache has 2026-05-07 but we request 2026-05-08 (holiday roll)
    // Simulate: cache has the entry but at an older date
    // Override lookup to return a stale result
    const staleCache: FxRateCacheRepo = {
      async lookup(_b, _q, _d) {
        return { rate: "0.85", date: "2026-05-07" };
      },
      async upsert() {},
      async mostRecentPrior() {
        return null;
      },
    };
    const provider = new FrankfurterFxProvider(staleCache, makeFailingFetch());
    const result = await provider.rateAsOf("USD", "EUR", TODAY);
    expect(result.rate).toBe("0.85");
    expect(result.isStale).toBe(true);
  });

  test("live success fresh: cache miss → fetches, caches, returns isStale=false", async () => {
    const provider = new FrankfurterFxProvider(
      cache,
      makeFetch(200, { date: "2026-05-08", rate: 0.86 }),
    );
    const result = await provider.rateAsOf("USD", "EUR", TODAY);
    expect(result.rate).toBe("0.86");
    expect(result.isStale).toBe(false);
    expect(cache.upsertCalls).toHaveLength(1);
    expect(cache.upsertCalls[0].rate).toBe("0.86");
  });

  test("Pitfall 4 - live success Frankfurter rolled back date: isStale=true", async () => {
    // Request 2026-05-08 (Friday), Frankfurter returns 2026-05-07 (rolled back one day)
    const provider = new FrankfurterFxProvider(
      cache,
      makeFetch(200, { date: "2026-05-07", rate: 0.85 }),
    );
    const result = await provider.rateAsOf("USD", "EUR", TODAY);
    expect(result.rate).toBe("0.85");
    expect(result.isStale).toBe(true);
  });

  test("live failure → fallback hit: returns mostRecentPrior with isStale=true", async () => {
    cache.setPrior("USD", "EUR", { rate: "0.84", date: "2026-05-04" });
    const provider = new FrankfurterFxProvider(cache, makeFailingFetch());
    const result = await provider.rateAsOf("USD", "EUR", TODAY);
    expect(result.rate).toBe("0.84");
    expect(result.isStale).toBe(true);
  });

  test("live failure → fallback miss: throws NoFxRateAvailable", async () => {
    const provider = new FrankfurterFxProvider(cache, makeFailingFetch());
    await expect(provider.rateAsOf("USD", "EUR", TODAY)).rejects.toBeInstanceOf(
      NoFxRateAvailable,
    );
  });

  test("spoofed live rate → uses stale prior instead of the bad number", async () => {
    // Upstream returns a negative rate; the guard rejects it, control falls into the
    // existing catch → mostRecentPrior fallback (isStale=true). Bad number never math'd.
    cache.setPrior("USD", "EUR", { rate: "0.84", date: "2026-05-04" });
    const provider = new FrankfurterFxProvider(
      cache,
      makeFetch(200, { date: "2026-05-08", rate: -0.86 }),
    );
    const result = await provider.rateAsOf("USD", "EUR", TODAY);
    expect(result.rate).toBe("0.84");
    expect(result.isStale).toBe(true);
    expect(cache.upsertCalls).toHaveLength(0); // bad rate never cached
  });

  test("spoofed live rate + no prior → NoFxRateAvailable", async () => {
    const provider = new FrankfurterFxProvider(
      cache,
      makeFetch(200, { date: "2026-05-08", rate: Number.POSITIVE_INFINITY }),
    );
    await expect(provider.rateAsOf("USD", "EUR", TODAY)).rejects.toBeInstanceOf(
      NoFxRateAvailable,
    );
  });

  test("ACL boundary: result.rate is always string, never number", async () => {
    const provider = new FrankfurterFxProvider(
      cache,
      makeFetch(200, { date: "2026-05-08", rate: 0.9234 }),
    );
    const result = await provider.rateAsOf("USD", "EUR", TODAY);
    expect(typeof result.rate).toBe("string");
  });

  // 261113 (user): BTC fell overnight yet the day read as a gain. Frankfurter
  // moves today's rate during the day; the first fetch was kept all day and the
  // day's whole move landed at once after UTC midnight. Today's rate is
  // fetched again once its last fetch is an hour old.
  describe("today's rate follows the day", () => {
    const at = (iso: string) => () => new Date(iso);
    const counting = (rates: number[]) => {
      let n = 0;
      const fn = (async () => {
        const rate = rates[Math.min(n, rates.length - 1)];
        n++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ date: "2026-05-08", rate }),
        } as Response;
      }) as unknown as typeof fetch;
      return { fn, calls: () => n };
    };

    test("a cached rate for today is fetched again and replaced", async () => {
      cache.setLookup("USD", "PLN", "2026-05-08", "3.93");
      const f = counting([3.9655]);
      const provider = new FrankfurterFxProvider(
        cache,
        f.fn,
        at("2026-05-08T12:00:00Z"),
      );
      const r = await provider.rateAsOf("USD", "PLN", TODAY);
      expect(r.rate).toBe("3.9655");
      expect(f.calls()).toBe(1);
      expect(cache.upsertCalls.at(-1)).toMatchObject({
        date: "2026-05-08",
        rate: "3.9655",
      });
    });

    test("within the hour the cached rate is reused; after it, fetched again", async () => {
      let now = new Date("2026-05-08T12:00:00Z");
      const f = counting([3.95, 3.96]);
      const provider = new FrankfurterFxProvider(cache, f.fn, () => now);
      await provider.rateAsOf("USD", "PLN", TODAY);
      now = new Date("2026-05-08T12:30:00Z");
      expect((await provider.rateAsOf("USD", "PLN", TODAY)).rate).toBe("3.95");
      expect(f.calls()).toBe(1);
      now = new Date("2026-05-08T13:01:00Z");
      expect((await provider.rateAsOf("USD", "PLN", TODAY)).rate).toBe("3.96");
      expect(f.calls()).toBe(2);
    });

    test("a failed refresh keeps today's cached rate", async () => {
      cache.setLookup("USD", "PLN", "2026-05-08", "3.93");
      const provider = new FrankfurterFxProvider(
        cache,
        makeFailingFetch(),
        at("2026-05-08T12:00:00Z"),
      );
      const r = await provider.rateAsOf("USD", "PLN", TODAY);
      expect(r.rate).toBe("3.93");
      expect(r.isStale).toBe(false);
    });

    test("a past day's cached rate is never fetched again", async () => {
      cache.setLookup("USD", "PLN", "2026-05-08", "3.93");
      const f = counting([9]);
      const provider = new FrankfurterFxProvider(
        cache,
        f.fn,
        at("2026-05-10T12:00:00Z"),
      );
      expect((await provider.rateAsOf("USD", "PLN", TODAY)).rate).toBe("3.93");
      expect(f.calls()).toBe(0);
    });
  });
});
