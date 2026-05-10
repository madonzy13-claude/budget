/**
 * fx.test.ts — tests for GET /fx/rate route.
 * TDD RED: tests fail until implementation lands.
 */
import { describe, test, expect, mock } from "bun:test";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// mock used for pg-boss only
import { Hono } from "hono";

// NOTE: fx route does not use @budget/platform directly — no platform mock needed.
// pg-boss mock prevents pool initialization side-effects from boss boot code.
class FakePgBoss {
  async start() { return this; }
  async work() {}
  async schedule() {}
  async createQueue() {}
  async send() {}
  async stop() {}
}
mock.module("pg-boss", () => ({
  default: FakePgBoss,
  PgBoss: FakePgBoss,
}));

const { createFxRoute } = await import("../../src/routes/fx");
const { FrankfurterFxProvider, NoFxRateAvailable } = await import(
  "@budget/budgeting/src/adapters/fx/frankfurter"
);

// Build a minimal BootedDeps-like object with a mock fxProvider
function buildDeps(fxProvider: InstanceType<typeof FrankfurterFxProvider>) {
  return {
    budgeting: { fxProvider },
  } as any;
}

// Fake in-memory cache
class FakeCacheRepo {
  private store = new Map<string, { rate: string; date: string }>();

  setRate(base: string, quote: string, date: string, rate: string) {
    this.store.set(`${base}/${quote}/${date}`, { rate, date });
  }

  async lookup(b: string, q: string, d: string) {
    return this.store.get(`${b}/${q}/${d}`) ?? null;
  }
  async upsert(b: string, q: string, d: string, r: string, p: string) {
    this.store.set(`${b}/${q}/${d}`, { rate: r, date: d });
  }
  async mostRecentPrior() { return null; }
}

describe("GET /fx/rate", () => {
  test("same currency (USD/USD) returns rate=1, isStale=false", async () => {
    const cache = new FakeCacheRepo() as any;
    const fxProvider = new FrankfurterFxProvider(cache);
    const app = new Hono();
    app.route("/fx", createFxRoute(buildDeps(fxProvider)));

    const res = await app.request("/fx/rate?from=USD&to=USD&date=2026-05-09");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.rate).toBe("1");
    expect(body.isStale).toBe(false);
    expect(body.provider).toBe("frankfurter");
  });

  test("cache hit: returns cached rate", async () => {
    const cache = new FakeCacheRepo() as any;
    cache.setRate("EUR", "USD", "2026-05-09", "0.92");
    const fxProvider = new FrankfurterFxProvider(cache);
    const app = new Hono();
    app.route("/fx", createFxRoute(buildDeps(fxProvider)));

    const res = await app.request("/fx/rate?from=EUR&to=USD&date=2026-05-09");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.rate).toBe("0.92");
    expect(body.fxRateDate).toBe("2026-05-09");
  });

  test("NoFxRateAvailable → 503", async () => {
    // Cache miss + no network + no prior = NoFxRateAvailable
    const cache: any = {
      async lookup() { return null; },
      async upsert() {},
      async mostRecentPrior() { return null; },
    };
    const fakeFetch: typeof fetch = async () => { throw new Error("network"); };
    const fxProvider = new FrankfurterFxProvider(cache, fakeFetch);
    const app = new Hono();
    app.route("/fx", createFxRoute(buildDeps(fxProvider)));

    const res = await app.request("/fx/rate?from=JPY&to=PLN&date=2026-05-09");
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error).toBe("no_fx_rate_available");
  });

  test("invalid query param returns 400", async () => {
    const cache = new FakeCacheRepo() as any;
    const fxProvider = new FrankfurterFxProvider(cache);
    const app = new Hono();
    app.route("/fx", createFxRoute(buildDeps(fxProvider)));

    // Invalid date format
    const res = await app.request("/fx/rate?from=USD&to=EUR&date=not-a-date");
    expect(res.status).toBe(400);
  });
});
