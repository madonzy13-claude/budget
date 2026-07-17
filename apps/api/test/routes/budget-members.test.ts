/**
 * budget-members.test.ts — Tests for SETT-05, SETT-07 member management routes
 *
 * Tests: GET /budgets/:id/members + POST /budgets/:id/members/:memberId/revoke
 * Also covers regression: POST /budgets/:id/share → 201 + url (D-15 / SHRD-03)
 *                          POST /budgets/:id/leave last-owner → 409 (D-12)
 *                          Route-ordering: GET /:id/members not swallowed by GET /:id
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budget member routes (SETT-05, SETT-07)", () => {
  function buildApp(
    session: unknown,
    budgetId = "budget-001",
    overrideDeps?: Record<string, unknown>,
  ) {
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? [budgetId] : []);
      await next();
    });

    const {
      budgetMembersRoutesFactory,
    } = require("../../src/routes/budget-members");

    // Default mock: user-owner is the owner, user-member is a regular member
    const defaultDeps = {
      tenancy: {
        workspaceRepo: {
          listMembers: async () => [
            { userId: "user-owner", role: "owner" },
            { userId: "user-member", role: "member" },
          ],
          setMemberRole: async () => {},
          reconcileOwnerUserId: async () => {},
          foldShareIntoOwner: async () => {},
        },
      },
      identity: {
        auth: {
          api: {
            removeMember: async () => ({}),
          },
        },
      },
    };

    const mergedDeps = { ...defaultDeps, ...overrideDeps };

    app.route("/budgets", budgetMembersRoutesFactory(mergedDeps as any));
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
      { method: "POST" },
    );
    expect(res.status).toBe(200);
  });

  it("POST /budgets/:id/members/:memberId/revoke as non-owner → 403", async () => {
    const app = buildApp({ user: { id: "user-member" } });
    const res = await app.request(
      "/budgets/budget-001/members/user-member/revoke",
      { method: "POST" },
    );
    expect(res.status).toBe(403);
  });

  it("revoke unauthenticated → 401", async () => {
    const app = buildApp(null);
    const res = await app.request(
      "/budgets/budget-001/members/user-member/revoke",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("POST .../revoke folds share into owner BEFORE removeMember (critical finding regression)", async () => {
    const calls: string[] = [];
    const app = buildApp({ user: { id: "user-owner" } }, "budget-001", {
      tenancy: {
        workspaceRepo: {
          listMembers: async () => [
            { userId: "user-owner", role: "owner" },
            { userId: "user-member", role: "member" },
          ],
          foldShareIntoOwner: async (
            budgetId: string,
            departingUserId: string,
          ) => {
            expect(budgetId).toBe("budget-001");
            expect(departingUserId).toBe("user-member");
            calls.push("fold");
          },
        },
      },
      identity: {
        auth: {
          api: {
            removeMember: async () => {
              calls.push("removeMember");
              return {};
            },
          },
        },
      },
    });
    const res = await app.request(
      "/budgets/budget-001/members/user-member/revoke",
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    // fold must run BEFORE the member row is removed (it reads the row's share)
    expect(calls).toEqual(["fold", "removeMember"]);
  });

  it("revoke last owner → 409 (last_owner guard, T-06-03-02)", async () => {
    // Only one owner, attempting to revoke themselves or another owner
    const app = buildApp({ user: { id: "user-owner" } }, "budget-001", {
      tenancy: {
        workspaceRepo: {
          listMembers: async () => [
            { userId: "user-owner", role: "owner" }, // only one owner
          ],
        },
      },
      identity: {
        auth: { api: { removeMember: async () => ({}) } },
      },
    });
    const res = await app.request(
      "/budgets/budget-001/members/user-owner/revoke",
      { method: "POST" },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("last_owner");
  });

  // ── Role change (promote/demote owners) — T-06 ownership ──────────────────
  it("POST .../role promote member→owner as owner → 200", async () => {
    const app = buildApp({ user: { id: "user-owner" } });
    const res = await app.request(
      "/budgets/budget-001/members/user-member/role",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "owner" }),
      },
    );
    expect(res.status).toBe(200);
  });

  it("POST .../role as non-owner → 403", async () => {
    const app = buildApp({ user: { id: "user-member" } });
    const res = await app.request(
      "/budgets/budget-001/members/user-owner/role",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "owner" }),
      },
    );
    expect(res.status).toBe(403);
  });

  it("POST .../role invalid role → 400", async () => {
    const app = buildApp({ user: { id: "user-owner" } });
    const res = await app.request(
      "/budgets/budget-001/members/user-member/role",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("POST .../role demote owner→member with 2 owners → 200", async () => {
    const app = buildApp({ user: { id: "user-owner" } }, "budget-001", {
      tenancy: {
        workspaceRepo: {
          listMembers: async () => [
            { userId: "user-owner", role: "owner" },
            { userId: "user-two", role: "owner" },
          ],
          setMemberRole: async () => {},
          reconcileOwnerUserId: async () => {},
        },
      },
    });
    const res = await app.request("/budgets/budget-001/members/user-two/role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST .../role demote the LAST owner → 409", async () => {
    const app = buildApp({ user: { id: "user-owner" } }, "budget-001", {
      tenancy: {
        workspaceRepo: {
          listMembers: async () => [{ userId: "user-owner", role: "owner" }],
          reconcileOwnerUserId: async () => {},
        },
      },
      identity: {
        auth: { api: { updateMemberRole: async () => ({}) } },
      },
    });
    const res = await app.request(
      "/budgets/budget-001/members/user-owner/role",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "member" }),
      },
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("last_owner");
  });

  it("GET /budgets/:id/members unauthenticated → 401", async () => {
    const app = buildApp(null);
    const res = await app.request("/budgets/budget-001/members");
    expect(res.status).toBe(401);
  });

  it("GET /budgets/:id/members non-member budget → 404 (T-06-03-03)", async () => {
    const app = buildApp({ user: { id: "user-001" } }, "budget-001");
    // Request a different budget the user is not a member of
    const res = await app.request("/budgets/other-budget/members");
    expect(res.status).toBe(404);
  });
});

describe("Budget members — regression: share + leave (D-15, D-12)", () => {
  function buildBudgetsApp(session: unknown, budgetId = "budget-001") {
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? [budgetId] : []);
      await next();
    });

    const { budgetsRoutesFactory } = require("../../src/routes/budgets");
    const {
      budgetMembersRoutesFactory,
    } = require("../../src/routes/budget-members");

    const fakeDeps = {
      tenancy: {
        workspaceRepo: {
          findById: async () => ({
            id: budgetId,
            name: "Test",
            slug: "test",
            kind: "SHARED",
            default_currency: "USD",
            ownerUserId: "user-owner",
            memberCount: 2,
            cushionModeEnabled: false,
            reservesEnabled: true,
          }),
          listForUser: async () => [],
          listMembers: async () => [
            { userId: "user-owner", role: "owner" },
            { userId: "user-member", role: "member" },
          ],
          hasTransactions: async () => false,
          // POST /leave moved off Better Auth onto the repo. The default
          // budget here has exactly one owner (user-owner) and one member
          // (user-member), so the only owner attempting to leave is by
          // definition the last owner — throw the same sentinel string
          // the production repo throws so the route maps to 409.
          leaveAsMember: async (_budgetId: string, userId: string) => {
            if (userId === "user-owner") throw new Error("last_owner");
            return;
          },
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
              id: "new-id",
              ...opts.body,
            }),
            leaveOrganization: async () => {
              throw new Error("Cannot leave as last owner");
            },
            removeMember: async () => ({}),
          },
        },
      },
      emailSender: { send: async () => {} },
      env: { APP_URL: "http://localhost:3000" },
      budgeting: {
        toggleBudgetMode: async () => ({
          isOk: () => true,
          isErr: () => false,
        }),
        adjustCategoryReserve: async () => ({
          isOk: () => false,
          isErr: () => true,
          error: { message: "not_found" },
        }),
      },
    } as any;

    // Members router BEFORE budgets router (same ordering as app.ts)
    app.route("/budgets", budgetMembersRoutesFactory(fakeDeps));
    app.route("/budgets", budgetsRoutesFactory(fakeDeps));
    return app;
  }

  it("POST /budgets/:id/leave as last owner → 409 (D-12 regression)", async () => {
    const app = buildBudgetsApp({ user: { id: "user-owner" } });
    const res = await app.request("/budgets/budget-001/leave", {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });

  it("Route ordering: GET /budgets/:id/members returns members shape, not GET /:id shape", async () => {
    const app = buildBudgetsApp({ user: { id: "user-owner" } });
    const membersRes = await app.request("/budgets/budget-001/members");
    expect(membersRes.status).toBe(200);
    const membersBody = (await membersRes.json()) as any;
    // Members response has { members: [...] } — not the GET /:id budget shape
    expect(Array.isArray(membersBody.members)).toBe(true);
    expect(membersBody.id).toBeUndefined(); // Should NOT be a budget object

    // Also verify GET /:id still returns budget shape
    const budgetRes = await app.request("/budgets/budget-001");
    expect(budgetRes.status).toBe(200);
    const budgetBody = (await budgetRes.json()) as any;
    expect(budgetBody.id).toBeDefined();
    expect(budgetBody.members).toBeUndefined();
  });
});

describe("PUT /budgets/:id/shares — authorization (SEC: cross-tenant + role)", () => {
  // Rebuilds the budgets app with a memberShareRepo whose update() records the
  // budgetId it was asked to write, so we can assert it is NEVER reached on a
  // rejected request (a plain status assertion would pass even if the write
  // already happened before the response).
  function buildApp(session: unknown, tenantBudgetId = "budget-001") {
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? [tenantBudgetId] : []);
      await next();
    });

    const updatedBudgets: string[] = [];
    const { budgetsRoutesFactory } = require("../../src/routes/budgets");
    const fakeDeps = {
      tenancy: {
        workspaceRepo: {
          findById: async () => null,
          listForUser: async () => [],
          listMembers: async () => [
            { userId: "user-owner", role: "owner" },
            { userId: "user-member", role: "member" },
          ],
        },
        memberShareRepo: {
          list: async () => [],
          update: async (budgetId: string) => {
            updatedBudgets.push(budgetId);
          },
        },
      },
      identity: { userRepo: {}, auth: { api: {} } },
      emailSender: { send: async () => {} },
      env: { APP_URL: "http://localhost:3000" },
      budgeting: {},
    } as any;

    app.route("/budgets", budgetsRoutesFactory(fakeDeps));
    return { app, updatedBudgets };
  }

  const body = JSON.stringify({
    shares: [{ userId: "user-attacker", percentage: "100" }],
  });
  const put = {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  };

  it("owner of the budget → 200 (no regression)", async () => {
    const { app, updatedBudgets } = buildApp({ user: { id: "user-owner" } });
    const res = await app.request("/budgets/budget-001/shares", put);
    expect(res.status).toBe(200);
    expect(updatedBudgets).toEqual(["budget-001"]);
  });

  it("cross-tenant: writing a budget the caller is NOT a member of → 404, no write", async () => {
    // Attacker's verified tenant is budget-001; they target other-budget via the URL.
    const { app, updatedBudgets } = buildApp({ user: { id: "user-owner" } });
    const res = await app.request("/budgets/other-budget/shares", put);
    expect(res.status).toBe(404);
    expect(updatedBudgets).toEqual([]); // update() must never be reached
  });

  it("non-owner member of the budget → 403, no write", async () => {
    const { app, updatedBudgets } = buildApp({ user: { id: "user-member" } });
    const res = await app.request("/budgets/budget-001/shares", put);
    expect(res.status).toBe(403);
    expect(updatedBudgets).toEqual([]);
  });

  it("unauthenticated → 401", async () => {
    const { app } = buildApp(null);
    const res = await app.request("/budgets/budget-001/shares", put);
    expect(res.status).toBe(401);
  });
});
