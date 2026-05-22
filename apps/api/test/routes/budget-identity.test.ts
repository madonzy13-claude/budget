/**
 * budget-identity.test.ts — Wave 0 RED scaffold for SETT-02 budget identity routes
 *
 * Tests: PATCH /budgets/:id (rename/currency) + GET /budgets/:id hasTransactions flag
 * Consumed GREEN by Plan 06-02.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budget identity routes (SETT-02)", () => {
  function buildApp(session: unknown, budgetId = "budget-001") {
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? [budgetId] : []);
      await next();
    });

    // Routes do not exist yet — RED scaffold
    // When Plan 06-02 implements them, require() will resolve.
    try {
      const {
        budgetIdentityRoutesFactory,
      } = require("../../src/routes/budget-identity");
      app.route(
        "/budgets",
        budgetIdentityRoutesFactory({ tenancy: {}, identity: {} } as any),
      );
    } catch {
      // Route factory not yet implemented — tests will fail RED as intended
    }

    return app;
  }

  it("PATCH /budgets/:id updates name → 200", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Budget" }),
    });
    expect(res.status).toBe(200);
  });

  it("PATCH /budgets/:id unauthenticated → 401", async () => {
    const app = buildApp(null);
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Budget" }),
    });
    expect(res.status).toBe(401);
  });

  it("PATCH /budgets/:id non-member budget → 404 (no existence leak)", async () => {
    const app = buildApp({ user: { id: "user-001" } }, "other-budget");
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Budget" }),
    });
    expect(res.status).toBe(404);
  });

  it("PATCH /budgets/:id with default_currency when budget has transactions → 409", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_currency: "EUR" }),
    });
    expect(res.status).toBe(409);
  });

  it("GET /budgets/:id response includes hasTransactions boolean", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.hasTransactions).toBe("boolean");
  });
});
