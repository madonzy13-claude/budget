/**
 * budget-members.test.ts — Wave 0 RED scaffold for SETT-05, SETT-07 member management routes
 *
 * Tests: GET /budgets/:id/members + POST /budgets/:id/members/:memberId/revoke
 * Consumed GREEN by Plan 06-03.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budget member routes (SETT-05, SETT-07)", () => {
  function buildApp(session: unknown, budgetId = "budget-001") {
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? [budgetId] : []);
      await next();
    });

    // Routes do not exist yet — RED scaffold
    // When Plan 06-03 implements them, require() will resolve.
    try {
      const {
        budgetMembersRoutesFactory,
      } = require("../../src/routes/budget-members");
      app.route(
        "/budgets",
        budgetMembersRoutesFactory({ tenancy: {}, identity: {} } as any),
      );
    } catch {
      // Route factory not yet implemented — tests will fail RED as intended
    }

    return app;
  }

  it("GET /budgets/:id/members returns member list → 200", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001/members");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.members)).toBe(true);
  });

  it("POST /budgets/:id/members/:memberId/revoke as owner → 200", async () => {
    const app = buildApp({ user: { id: "user-owner" } });
    const res = await app.request(
      "/budgets/budget-001/members/user-member/revoke",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(200);
  });

  it("POST /budgets/:id/members/:memberId/revoke as non-owner → 403", async () => {
    const app = buildApp({ user: { id: "user-member" } });
    const res = await app.request(
      "/budgets/budget-001/members/user-member/revoke",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(403);
  });

  it("revoke unauthenticated → 401", async () => {
    const app = buildApp(null);
    const res = await app.request(
      "/budgets/budget-001/members/user-member/revoke",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(401);
  });
});
