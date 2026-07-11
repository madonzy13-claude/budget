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
    opts: {
      hasTransactions?: boolean;
      callerRole?: string;
      updateIdentitySpy?: (
        budgetId: string,
        patch: Record<string, unknown>,
        actorUserId: string,
      ) => void;
      recomputeSpy?: (input: { tenantId: string; budgetId: string }) => void;
    } = {},
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
          updateIdentity: async (
            id: string,
            patch: Record<string, unknown>,
            actorUserId: string,
          ) => {
            opts.updateIdentitySpy?.(id, patch, actorUserId);
          },
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
        recomputeCushionTaskRunner: async (input: {
          tenantId: string;
          budgetId: string;
        }) => {
          opts.recomputeSpy?.(input);
        },
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

  it("PATCH /budgets/:id with default_currency when budget has transactions → 409, updateIdentity NOT called", async () => {
    let called = false;
    const app = buildApp({ user: { id: "user-001" } }, "budget-001", {
      hasTransactions: true,
      updateIdentitySpy: () => {
        called = true;
      },
    });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_currency: "EUR" }),
    });
    expect(res.status).toBe(409);
    expect(called).toBe(false);
  });

  // quick-260613-nkb: the bug — a ZERO-transaction budget MUST be able to change
  // its default currency (200 + updateIdentity called with { defaultCurrency }).
  it("PATCH /budgets/:id with default_currency on a ZERO-transaction budget → 200, updateIdentity called", async () => {
    let captured: Record<string, unknown> | null = null;
    const app = buildApp({ user: { id: "user-001" } }, "budget-001", {
      hasTransactions: false,
      updateIdentitySpy: (_id, patch) => {
        captured = patch;
      },
    });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_currency: "EUR" }),
    });
    expect(res.status).toBe(200);
    expect(captured).toEqual({ defaultCurrency: "EUR" });
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

  // Phase 7 Plan 07-07 (D-PH7-15, D-PH7-19, TASK-06): cushion_target_months
  // + recompute trigger + cushion_enabled=false inline auto-resolve.
  it("PATCH /budgets/:id with cushion_target_months=12 → 200; passes cushionTargetMonths to updateIdentity", async () => {
    let captured: Record<string, unknown> | null = null;
    const app = buildApp({ user: { id: "user-001" } }, "budget-001", {
      updateIdentitySpy: (_id, patch) => {
        captured = patch;
      },
    });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cushion_target_months: 12 }),
    });
    expect(res.status).toBe(200);
    expect(captured).toEqual({ cushionTargetMonths: 12 });
  });

  it("PATCH /budgets/:id with overview_enabled=false → 200; passes overviewEnabled to updateIdentity (r36)", async () => {
    let captured: Record<string, unknown> | null = null;
    const app = buildApp({ user: { id: "user-001" } }, "budget-001", {
      hasTransactions: false,
      updateIdentitySpy: (_id, patch) => {
        captured = patch;
      },
    });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overview_enabled: false }),
    });
    expect(res.status).toBe(200);
    expect(captured).toEqual({ overviewEnabled: false });
  });

  it("PATCH /budgets/:id overview_enabled by non-owner → 403 (owner gate, r36)", async () => {
    const app = buildApp({ user: { id: "user-001" } }, "budget-001", {
      callerRole: "member",
    });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overview_enabled: false }),
    });
    expect(res.status).toBe(403);
  });

  it("PATCH /budgets/:id with cushion_target_months=0 → 400 (Zod min=1)", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cushion_target_months: 0 }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("PATCH /budgets/:id with cushion_target_months=61 → 400 (Zod max=60)", async () => {
    const app = buildApp({ user: { id: "user-001" } });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cushion_target_months: 61 }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("PATCH cushion_target_months fires recomputeCushionTaskRunner (D-PH7-19)", async () => {
    let recomputed: { tenantId: string; budgetId: string } | null = null;
    const app = buildApp({ user: { id: "user-001" } }, "budget-001", {
      recomputeSpy: (input) => {
        recomputed = input;
      },
    });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cushion_target_months: 9 }),
    });
    expect(res.status).toBe(200);
    expect(recomputed).toEqual({
      tenantId: "budget-001",
      budgetId: "budget-001",
    });
  });

  it("PATCH cushion_enabled=false fires recomputeCushionTaskRunner — inline auto-resolves PENDING task in same request (TASK-06)", async () => {
    let recomputed: { tenantId: string; budgetId: string } | null = null;
    const app = buildApp({ user: { id: "user-001" } }, "budget-001", {
      recomputeSpy: (input) => {
        recomputed = input;
      },
    });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cushion_enabled: false }),
    });
    expect(res.status).toBe(200);
    // recomputeCushionTask sees summary.enabled=false → resolveByKindAndBudget
    // clears the open CUSHION_BELOW_TARGET row before the 200 response lands.
    // This is the INLINE auto-resolve path — sweep is NOT the only mechanism.
    expect(recomputed).toEqual({
      tenantId: "budget-001",
      budgetId: "budget-001",
    });
  });

  it("PATCH name (non-cushion field) does NOT fire recompute", async () => {
    let recomputed: { tenantId: string; budgetId: string } | null = null;
    const app = buildApp({ user: { id: "user-001" } }, "budget-001", {
      recomputeSpy: (input) => {
        recomputed = input;
      },
    });
    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    expect(res.status).toBe(200);
    // Only cushion-affecting fields trigger recompute.
    expect(recomputed).toBeNull();
  });

  it("PATCH recompute failure does NOT fail the PATCH (best-effort A2 fallback)", async () => {
    // Build app where the runner throws — PATCH must still return 200.
    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", { user: { id: "user-001" } });
      c.set("tenantIds", ["budget-001"]);
      await next();
    });
    const {
      budgetIdentityRoutesFactory,
    } = require("../../src/routes/budget-identity");
    const fakeDeps = {
      tenancy: {
        workspaceRepo: {
          hasTransactions: async () => true,
          updateIdentity: async () => {},
          listMembers: async () => [{ userId: "user-001", role: "owner" }],
          findById: async () => ({
            id: "budget-001",
            name: "Test",
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
        recomputeCushionTaskRunner: async () => {
          throw new Error("DB connection lost");
        },
      },
    } as any;
    app.route("/budgets", budgetIdentityRoutesFactory(fakeDeps));

    const res = await app.request("/budgets/budget-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cushion_target_months: 12 }),
    });
    expect(res.status).toBe(200); // Recompute failure must not 500 the PATCH.
  });
});
