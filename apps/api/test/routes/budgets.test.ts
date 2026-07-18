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
          setDisplayCurrencyIfUnset: async () => {},
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

  it("GET /budgets/:id returns 200 with reservesEnabled=true for a known budget", async () => {
    // Patch the fake deps' workspaceRepo to return a budget with reservesEnabled
    const { budgetsRoutesFactory } = require("../../src/routes/budgets");
    const app2 = new Hono();
    app2.use(async (c: any, next: any) => {
      c.set("session", {
        user: { id: "user-001", email: "test@test.com" },
      } as any);
      c.set("tenantIds", ["budget-001"]);
      await next();
    });
    const fakeDeps2 = {
      tenancy: {
        workspaceRepo: {
          findById: async (id: string) =>
            id === "budget-001"
              ? {
                  id: "budget-001",
                  slug: "abc123",
                  name: "Test Budget",
                  kind: "PRIVATE" as const,
                  default_currency: "USD",
                  ownerUserId: "user-001",
                  memberCount: 1,
                  createdAt: new Date(),
                  cushionModeEnabled: false,
                  reservesEnabled: true,
                }
              : null,
          listForUser: async () => [],
          listMembers: async () => [],
          hasTransactions: async () => false,
          updateIdentity: async () => {},
          getAggPrefsForUser: async () =>
            new Map([
              [
                "budget-001",
                { ownership_share_pct: 100, include_in_aggregation: false },
              ],
            ]),
        },
        memberShareRepo: { list: async () => [], update: async () => {} },
      },
      identity: {
        userRepo: {
          getActiveWorkspaceIds: async () => [] as string[],
          setActiveWorkspaceIds: async () => {},
          findById: async () => null,
          updateLocale: async () => {},
          setDisplayCurrencyIfUnset: async () => {},
        },
        auth: { api: { createOrganization: async () => ({}) } },
      },
    } as any;
    app2.route("/budgets", budgetsRoutesFactory(fakeDeps2));
    const res = await app2.request("/budgets/budget-001");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.reservesEnabled).toBe(true);
    expect(body.id).toBe("budget-001");
    // Task 11: caller's own include_in_aggregation flag surfaces on GET.
    expect(body.includeInAggregation).toBe(false);
    // Self-set ownership share (no Σ=100 constraint) also surfaces on GET.
    expect(body.ownership_share_pct).toBe(100);
  });

  it("GET /budgets/:id returns 404 when budget not in tenantIds", async () => {
    const { budgetsRoutesFactory } = require("../../src/routes/budgets");
    const app3 = new Hono();
    app3.use(async (c: any, next: any) => {
      c.set("session", { user: { id: "user-001" } } as any);
      c.set("tenantIds", ["other-budget"]);
      await next();
    });
    const fakeDeps3 = {
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
          getActiveWorkspaceIds: async () => [],
          setActiveWorkspaceIds: async () => {},
          findById: async () => null,
          updateLocale: async () => {},
          setDisplayCurrencyIfUnset: async () => {},
        },
        auth: { api: {} },
      },
    } as any;
    app3.route("/budgets", budgetsRoutesFactory(fakeDeps3));
    const res = await app3.request("/budgets/budget-001");
    expect(res.status).toBe(404);
  });

  it("GET /budgets/active returns 200 and lists memberships (must beat /:id route in Hono priority)", async () => {
    // Regression guard for Phase 5: GET /budgets/:id (D-PH5-R11) was added
    // BEFORE GET /budgets/active in the factory; Hono then matched
    // `/active` as `:id = "active"` and returned 404. /active must be
    // registered first so the static path wins.
    const { budgetsRoutesFactory } = require("../../src/routes/budgets");
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", { user: { id: "user-001" } } as any);
      c.set("tenantIds", []);
      await next();
    });
    const fakeDeps = {
      tenancy: {
        workspaceRepo: {
          findById: async () => null,
          listForUser: async () => [
            {
              id: "budget-001",
              slug: "abc123",
              name: "Budget One",
              kind: "PRIVATE",
              default_currency: "USD",
              ownerUserId: "user-001",
              memberCount: 1,
              createdAt: new Date(),
              cushionModeEnabled: false,
            },
          ],
          listMembers: async () => [],
        },
        memberShareRepo: { list: async () => [], update: async () => {} },
      },
      identity: {
        userRepo: {
          getActiveWorkspaceIds: async () => [],
          setActiveWorkspaceIds: async () => {},
          findById: async () => null,
          updateLocale: async () => {},
          setDisplayCurrencyIfUnset: async () => {},
        },
        auth: { api: {} },
      },
    } as any;
    app.route("/budgets", budgetsRoutesFactory(fakeDeps));
    const res = await app.request("/budgets/active");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.budgets).toHaveLength(1);
    expect(body.budgets[0].id).toBe("budget-001");
    expect(body.workspaces).toHaveLength(1);
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
