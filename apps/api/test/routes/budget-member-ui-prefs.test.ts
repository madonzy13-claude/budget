/**
 * budget-member-ui-prefs.test.ts — per-member UI preferences (260802).
 *
 * The Overview's category pickers remembered their choice in localStorage, so
 * the same person opening the budget on a second device was back to "All
 * categories" (user report). The choice now rides the MEMBER row, which makes it
 * follow them across devices — and, because every write binds the caller's own
 * user id, one member can never read or set another's.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Member UI preferences", () => {
  function buildApp(
    session: unknown,
    budgetId = "budget-001",
    store: Record<string, unknown> = {},
  ) {
    const calls: Array<{ budgetId: string; userId: string; patch: unknown }> =
      [];
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", session as any);
      c.set("tenantIds", session ? [budgetId] : []);
      await next();
    });
    const {
      budgetMembersRoutesFactory,
    } = require("../../src/routes/budget-members");
    const deps = {
      tenancy: {
        workspaceRepo: {
          listMembers: async () => [
            { userId: "user-owner", role: "owner" },
            { userId: "user-member", role: "member" },
          ],
          getMemberUiPrefs: async () => store,
          mergeMemberUiPrefs: async (
            b: string,
            u: string,
            patch: Record<string, unknown>,
          ) => {
            calls.push({ budgetId: b, userId: u, patch });
            Object.assign(store, patch);
            return store;
          },
        },
      },
      identity: { auth: { api: { removeMember: async () => ({}) } } },
    };
    app.route("/budgets", budgetMembersRoutesFactory(deps as any));
    return { app, calls, store };
  }

  it("GET returns the caller's stored preferences → 200", async () => {
    const { app } = buildApp({ user: { id: "user-member" } }, "budget-001", {
      "planned-categories": [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
    });
    const res = await app.request("/budgets/budget-001/ui-prefs");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      prefs: {
        "planned-categories": [
          "11111111-1111-4111-8111-111111111111",
          "22222222-2222-4222-8222-222222222222",
        ],
      },
    });
  });

  it("GET on an untouched member reads as empty, not as an error → 200", async () => {
    const { app } = buildApp({ user: { id: "user-member" } });
    const res = await app.request("/budgets/budget-001/ui-prefs");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prefs: {} });
  });

  it("PUT merges the patch into the CALLER's own row → 200", async () => {
    const { app, calls, store } = buildApp(
      { user: { id: "user-member" } },
      "budget-001",
      { "planned-categories": ["11111111-1111-4111-8111-111111111111"] },
    );
    const res = await app.request("/budgets/budget-001/ui-prefs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prefs: {
          "planned-pie-categories": ["33333333-3333-4333-8333-333333333333"],
        },
      }),
    });
    expect(res.status).toBe(200);
    // Bound to the session user — a member can never write another's row.
    expect(calls).toEqual([
      {
        budgetId: "budget-001",
        userId: "user-member",
        patch: {
          "planned-pie-categories": ["33333333-3333-4333-8333-333333333333"],
        },
      },
    ]);
    // A patch, not a replace: the other chart keeps its choice.
    expect(store).toEqual({
      "planned-categories": ["11111111-1111-4111-8111-111111111111"],
      "planned-pie-categories": ["33333333-3333-4333-8333-333333333333"],
    });
  });

  it("PUT rejects a value that is not a list of ids → 400", async () => {
    const { app, calls } = buildApp({ user: { id: "user-member" } });
    const res = await app.request("/budgets/budget-001/ui-prefs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefs: { "planned-categories": "everything" } }),
    });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("a budget the caller is not in stays a 404, with no existence leak", async () => {
    const { app } = buildApp({ user: { id: "user-member" } }, "budget-001");
    const res = await app.request("/budgets/other-budget/ui-prefs");
    expect(res.status).toBe(404);
  });

  it("unauthenticated → 401", async () => {
    const { app } = buildApp(null);
    const res = await app.request("/budgets/budget-001/ui-prefs");
    expect(res.status).toBe(401);
  });
});
