/**
 * budgets.test.ts — Integration tests for /budgets routes (renamed from workspaces)
 *
 * TDD: Written RED before route rename. Tests the renamed /budgets path,
 * the /budgets/health smoke endpoint (ROADMAP #5), and verifies old /workspaces
 * returns 404 (D-09 no-alias check).
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budgets route (renamed from workspaces)", () => {
  function buildApp(session: unknown) {
    const { budgetsRoutesFactory } = require("../../src/routes/budgets");

    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? ["budget-001"] : []);
      await next();
    });

    const fakeDeps = {
      tenancy: {
        workspaceRepo: {
          findById: async () => null,
          listForUser: async () => [],
          listMembers: async () => [],
        },
        memberShareRepo: { list: async () => [], update: async () => {} },
      },
      identity: {
        userRepo: {
          getActiveWorkspaceIds: async () => [] as string[],
          setActiveWorkspaceIds: async () => {},
          findById: async () => null,
          updateLocale: async () => {},
        },
        auth: {
          api: {
            createOrganization: async (opts: any) => ({
              id: "new-budget-id",
              ...opts.body,
            }),
          },
        },
      },
    } as any;

    app.route("/budgets", budgetsRoutesFactory(fakeDeps));
    return app;
  }

  it("POST /budgets creates a budget and returns 201", async () => {
    const app = buildApp({
      user: { id: "user-001", email: "test@test.com", locale: "en" },
    });
    const res = await app.request("/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Budget",
        kind: "PRIVATE",
        default_currency: "USD",
      }),
    });
    expect(res.status).toBe(201);
  });

  it("GET /budgets/health returns 200", async () => {
    const app = buildApp(null);
    const res = await app.request("/budgets/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  it("GET /workspaces/health returns 404", async () => {
    const app = buildApp(null);
    const res = await app.request("/workspaces/health");
    expect(res.status).toBe(404);
  });

  it("POST /workspaces returns 404", async () => {
    const app = buildApp({
      user: { id: "user-001", email: "test@test.com", locale: "en" },
    });
    const res = await app.request("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Workspace",
        kind: "PRIVATE",
        default_currency: "USD",
      }),
    });
    expect(res.status).toBe(404);
  });
});
