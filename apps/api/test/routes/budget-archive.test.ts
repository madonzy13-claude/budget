/**
 * budget-archive.test.ts — Tests for SETT-08 archive/delete routes
 *
 * Tests: POST /budgets/:id/archive + POST /budgets/:id/delete
 * Consumed GREEN by Plan 06-04.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budget archive/delete routes (SETT-08)", () => {
  function buildApp(session: unknown, isOwner = true, budgetId = "budget-001") {
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? [budgetId] : []);
      await next();
    });

    const {
      budgetArchiveRoutesFactory,
    } = require("../../src/routes/budget-archive");

    // Mock workspaceRepo: listMembers returns owner/member based on isOwner flag.
    // archive records the call; hardDelete records the call.
    const archivedAt = new Date().toISOString();
    const mockWorkspaceRepo = {
      listMembers: async (_budgetId: string) => {
        if (!session) return [];
        const userId = (session as any).user.id;
        return isOwner
          ? [{ userId, role: "owner" }]
          : [{ userId, role: "member" }];
      },
      archive: async (_budgetId: string, _actorUserId: string) => ({
        archivedAt,
      }),
      hardDelete: async (_budgetId: string, _actorUserId: string) => {},
      // findById: returns a budget with name "My Budget" for typed-name validation
      findById: async (_id: string) => ({ name: "My Budget" }),
    };

    app.route(
      "/budgets",
      budgetArchiveRoutesFactory({ tenancy: { workspaceRepo: mockWorkspaceRepo }, identity: {} } as any),
    );

    return { app, archivedAt };
  }

  it("POST /budgets/:id/archive as owner → 200, sets archived_at", async () => {
    const { app, archivedAt } = buildApp({ user: { id: "user-owner" } }, true);
    const res = await app.request("/budgets/budget-001/archive", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.archivedAt).not.toBeNull();
  });

  it("POST /budgets/:id/archive as non-owner → 403", async () => {
    const { app } = buildApp({ user: { id: "user-member" } }, false);
    const res = await app.request("/budgets/budget-001/archive", {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  it("POST /budgets/:id/delete with matching typed name as owner → 200", async () => {
    const { app } = buildApp({ user: { id: "user-owner" } }, true);
    const res = await app.request("/budgets/budget-001/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: "My Budget" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /budgets/:id/delete with WRONG typed name → 422 (server re-validates)", async () => {
    const { app } = buildApp({ user: { id: "user-owner" } }, true);
    const res = await app.request("/budgets/budget-001/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: "Wrong Name" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("name_mismatch");
  });

  it("POST /budgets/:id/delete as non-owner → 403", async () => {
    const { app } = buildApp({ user: { id: "user-member" } }, false);
    const res = await app.request("/budgets/budget-001/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: "My Budget" }),
    });
    expect(res.status).toBe(403);
  });
});
