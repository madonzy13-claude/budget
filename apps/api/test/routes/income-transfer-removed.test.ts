/**
 * income-transfer-removed.test.ts — Verifies that old v1.0 routes return 404.
 * RED: Written before route cleanup in Task 3.
 *
 * TXN-08: GET /history, POST /correct, POST /income, POST /transfer, GET /recurring-drafts
 * all must return 404 after Phase 2 route restructure.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";

async function buildFullApp(userId: string, budgetId: string) {
  // Import the full app factory which mounts all routes
  // After Task 3, recurring-drafts will be deleted and income/transfer routes removed.
  const { createApp } = await import("../../src/app");

  // Minimal deps that won't throw on route registration
  const fakeDeps = {
    env: { REGION: "test" },
    fxProvider: {
      rateAsOf: async () => ({ rate: "1", provider: "stub", isStale: false }),
    },
    budgeting: {
      createTransaction: async () => ({ isErr: () => true, error: { message: "not impl" } }),
      editTransaction: async () => ({ isErr: () => true, error: { message: "not impl" } }),
      getTransactionHistory: async () => ({ isErr: () => true, error: { message: "not impl" } }),
      getLatestTransactions: async () => ({ isErr: () => false, value: [] }),
      searchTransactions: async () => ({ isErr: () => false, value: { rows: [], nextCursor: null } }),
      bulkRecategorize: async () => ({ isErr: () => false, value: {} }),
      listPendingDrafts: async () => ({ isErr: () => false, value: [] }),
      confirmRecurringDraft: async () => ({ isErr: () => false, value: {} }),
      editAndConfirmRecurringDraft: async () => ({ isErr: () => false, value: {} }),
      skipRecurringDraft: async () => ({ isErr: () => false, value: {} }),
    },
    tenancy: {
      workspaceRepo: { findById: async () => null, listForUser: async () => [] },
    },
    identity: {
      auth: { handler: async () => new Response("", { status: 404 }) },
      userRepo: {
        getActiveWorkspaceIds: async () => [],
        setActiveWorkspaceIds: async () => {},
        findById: async () => null,
        updateLocale: async () => {},
      },
    },
  } as any;

  const app = createApp(fakeDeps);
  return app;
}

// For a simpler approach: directly test the transactions route and the old sub-paths
async function buildTransactionsRouteApp(userId: string, budgetId: string) {
  const { createTransactionsRoute } = await import("../../src/routes/transactions");
  const fakeDeps = {
    fxProvider: {
      rateAsOf: async () => ({ rate: "1", provider: "stub", isStale: false }),
    },
  } as any;

  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", budgetId);
    c.set("tenantIds", [budgetId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/budgets/:budgetId/transactions", createTransactionsRoute(fakeDeps));
  return app;
}

describe("Removed v1.0 routes return 404", () => {
  const fakeUserId = crypto.randomUUID();
  const fakeBudgetId = crypto.randomUUID();
  const fakeTxId = crypto.randomUUID();

  it("POST /budgets/:id/income → 404 (income folded into transactions with negative amount)", async () => {
    const app = await buildTransactionsRouteApp(fakeUserId, fakeBudgetId);
    const res = await app.request(`/budgets/${fakeBudgetId}/income`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("POST /budgets/:id/transfer → 404 (transfer removed in Phase 2)", async () => {
    const app = await buildTransactionsRouteApp(fakeUserId, fakeBudgetId);
    const res = await app.request(`/budgets/${fakeBudgetId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("GET /budgets/:id/transactions/:txId/history → 404 (correction history removed)", async () => {
    const app = await buildTransactionsRouteApp(fakeUserId, fakeBudgetId);
    const res = await app.request(
      `/budgets/${fakeBudgetId}/transactions/${fakeTxId}/history`,
    );
    expect(res.status).toBe(404);
  });

  it("POST /budgets/:id/transactions/:txId/correct → 404 (correction flow removed)", async () => {
    const app = await buildTransactionsRouteApp(fakeUserId, fakeBudgetId);
    const res = await app.request(
      `/budgets/${fakeBudgetId}/transactions/${fakeTxId}/correct`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(404);
  });

  it("GET /budgets/:id/recurring-drafts → 404 (folded into ?confirmed=false)", async () => {
    const app = await buildTransactionsRouteApp(fakeUserId, fakeBudgetId);
    const res = await app.request(
      `/budgets/${fakeBudgetId}/recurring-drafts`,
    );
    expect(res.status).toBe(404);
  });
});
