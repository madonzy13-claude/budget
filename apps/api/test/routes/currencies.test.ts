/**
 * currencies.test.ts — integration tests for GET /currencies route.
 * ENGR-03: route coverage sentinel.
 *
 * currencies route is public (no auth required) and returns supported
 * currency catalogue from DB. Tests use a mock repo to avoid DB dependency.
 */
import { describe, test, expect, mock } from "bun:test";
import { Hono } from "hono";

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

// Mock the persistence import used inside the route handler
mock.module(
  "@budget/budgeting/src/adapters/persistence/supported-currencies-repo",
  () => ({
    listSupportedCurrenciesFromDb: async () => [
      { isoCode: "USD", symbol: "$", kind: "fiat" },
      { isoCode: "EUR", symbol: "€", kind: "fiat" },
      { isoCode: "BTC", symbol: "₿", kind: "crypto" },
    ],
  }),
);

const { createCurrenciesRoute } = await import("../../src/routes/currencies");

// Build app: mount the sub-router directly so GET "/" matches GET "/"
function buildCurrenciesApp() {
  const app = new Hono();
  const sub = createCurrenciesRoute({} as any);
  app.route("/currencies", sub);
  return app;
}

describe("GET /currencies", () => {
  test("returns 200 with currency list", async () => {
    const app = buildCurrenciesApp();
    // Hono matches trailing slash on sub-router root
    const res = await app.request("/currencies");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.currencies)).toBe(true);
  });

  test("each currency has value, label, symbol, kind fields", async () => {
    const app = buildCurrenciesApp();
    const res = await app.request("/currencies");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const first = body.currencies[0];
    expect(first).toHaveProperty("value");
    expect(first).toHaveProperty("label");
    expect(first).toHaveProperty("symbol");
    expect(first).toHaveProperty("kind");
  });

  test("returns currencies of mixed kinds (fiat and crypto)", async () => {
    const app = buildCurrenciesApp();
    const res = await app.request("/currencies");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const kinds = body.currencies.map((c: any) => c.kind);
    expect(kinds).toContain("fiat");
    expect(kinds).toContain("crypto");
  });
});
