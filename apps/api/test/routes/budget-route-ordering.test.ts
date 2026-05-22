/**
 * budget-route-ordering.test.ts — Wave 0 regression guard for new /:id sub-path ordering
 *
 * RESEARCH Pitfall 1: asserts new sub-paths (members, archive, delete, revoke) are NOT
 * swallowed by GET /budgets/:id when mounted on the same router.
 *
 * This test is RED now (sub-paths not yet implemented). It turns GREEN when Plans
 * 06-02/03/04 register the sub-path routes before the catch-all /:id handler.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budget route ordering regression (/:id sub-paths not swallowed)", () => {
  function buildApp(session: unknown) {
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? ["budget-001"] : []);
      await next();
    });

    // Minimal mock deps — enough to satisfy the owner-gate and archive/delete handlers
    const mockDeps = {
      tenancy: {
        workspaceRepo: {
          listMembers: async () => [
            { userId: "user-001", role: "owner" },
          ],
          findById: async () => ({ name: "My Budget" }),
          archive: async () => ({ archivedAt: new Date().toISOString() }),
          hardDelete: async () => {},
          listForUser: async () => [],
          updateIdentity: async () => {},
          hasTransactions: async () => false,
        },
      },
      identity: {
        auth: {
          api: {
            removeMember: async () => ({}),
          },
        },
      },
    } as any;

    // Sub-path routes MUST be mounted BEFORE the catch-all /:id in budgetsRoutesFactory
    // (mirrors the order in app.ts — this ordering test enforces that invariant)
    try {
      const { budgetMembersRoutesFactory } = require("../../src/routes/budget-members");
      app.route("/budgets", budgetMembersRoutesFactory(mockDeps));
    } catch {
      // members routes not yet implemented
    }
    try {
      const { budgetArchiveRoutesFactory } = require("../../src/routes/budget-archive");
      app.route("/budgets", budgetArchiveRoutesFactory(mockDeps));
    } catch {
      // archive/delete routes not yet implemented
    }
    try {
      const { budgetsRoutesFactory } = require("../../src/routes/budgets");
      app.route("/budgets", budgetsRoutesFactory(mockDeps));
    } catch {
      // base routes not yet mounted
    }

    return app;
  }

  it("GET /budgets/:id/members is distinct from GET /budgets/:id", async () => {
    const app = buildApp({ user: { id: "user-001" } });

    const budgetRes = await app.request("/budgets/budget-001");
    const membersRes = await app.request("/budgets/budget-001/members");

    // The /members endpoint must return { members: [...] }, not the budget object
    // This fails RED until sub-path routes are registered before catch-all /:id
    expect(membersRes.status).toBe(200);
    const body = (await membersRes.json()) as any;
    expect(body).toHaveProperty("members");
    expect(Array.isArray(body.members)).toBe(true);
  });

  it("POST /budgets/:id/archive is a distinct route (not matched by GET /:id)", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001/archive", { method: "POST" });
    // Should return 200 (archive) not the budget object from GET /:id
    expect(res.status).toBe(200);
  });

  it("POST /budgets/:id/delete is a distinct route (not matched by GET /:id)", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: "My Budget" }),
    });
    // Should return 200/422 (delete validation), not 405 Method Not Allowed from GET /:id
    expect([200, 422]).toContain(res.status);
  });

  it("POST /budgets/:id/members/:memberId/revoke is a distinct nested route", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001/members/user-member/revoke", {
      method: "POST",
    });
    // Should not fall through to GET /:id — expects 200 or 403
    expect([200, 403]).toContain(res.status);
  });
});
