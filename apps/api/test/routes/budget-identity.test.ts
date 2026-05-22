/**
 * budget-identity.test.ts — Wave 0 RED scaffold for SETT-02 budget identity routes
 *
 * Tests: PATCH /budgets/:id (rename/currency) + GET /budgets/:id hasTransactions flag
 * Consumed GREEN by Plan 06-02.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budget identity routes (SETT-02)", () => {
  function buildApp(
    session: unknown,
    budgetId = "budget-001",
    opts: { hasTransactions?: boolean; callerRole?: string } = {},
  ) {
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? [budgetId] : []);
      await next();
    });

    const {
      budgetIdentityRoutesFactory,
    } = require("../../src/routes/budget-identity");

    const fakeDeps = {
      tenancy: {
        workspaceRepo: {
          hasTransactions: async () => opts.hasTransactions ?? true,
          updateIdentity: async () => {},
          // T-06-02-00: owner-only gate reads membership roles
          listMembers: async () => [
            { userId: "user-001", role: opts.callerRole ?? "owner" },
          ],
          findById: async () => ({
            id: budgetId,
            name: "Test Budget",
            slug: "test",
            kind: "PRIVATE",
            default_currency: "USD",
            ownerUserId: "user-001",
            memberCount: 1,
            cushionModeEnabled: false,
            reservesEnabled: true,
          }),
        },
      },
      identity: {},
      budgeting: {
        toggleBudgetMode: async () => ({ isErr: () => false, value: {} }),
      },
    } as any;

    app.route("/budgets", budgetIdentityRoutesFactory(fakeDeps));

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

  it("PATCH /budgets/:id by non-owner member → 403 (T-06-02-00 owner gate)", async () => {
    const app = buildApp({ user: { id: "user-001" } }, "budget-001", {
      callerRole: "member",
    });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Budget" }),
    });
    expect(res.status).toBe(403);
  });

  it("GET /budgets/:id response includes hasTransactions boolean", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.hasTransactions).toBe("boolean");
  });
});
