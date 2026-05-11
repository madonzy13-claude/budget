/**
 * budget-settings.test.ts — Integration tests for /budget-settings routes
 * (renamed from workspace-settings)
 *
 * TDD: Written RED before route rename. Tests renamed /budget-settings path
 * and verifies /workspace-settings returns 404 (D-09).
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

describe("Budget settings route", () => {
  function buildApp(userId: string, tenantId: string) {
    const {
      createBudgetSettingsRoute,
    } = require("../../src/routes/budget-settings");

    const fakeDeps = {
      budgeting: {
        toggleBudgetMode: async (_input: any) => {
          const { ok } = require("@budget/shared-kernel");
          return ok({ mode: "NORMAL" });
        },
      },
    } as any;

    const app = new Hono();
    app.use(async (c: any, next: any) => {
      c.set("session", { user: { id: userId } });
      c.set("tenantIds", [tenantId]);
      c.set("userId", userId);
      await next();
    });
    app.route("/budget-settings", createBudgetSettingsRoute(fakeDeps));
    return app;
  }

  it("POST /budget-settings/budget-mode updates budget identity", async () => {
    const app = buildApp("user-001", "tenant-001");
    const res = await app.request("/budget-settings/budget-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "NORMAL", effectiveFrom: "2026-01-01" }),
    });
    expect(res.status).toBe(200);
  });

  it("PATCH /workspace-settings returns 404", async () => {
    const app = buildApp("user-001", "tenant-001");
    const res = await app.request("/workspace-settings/budget-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "NORMAL", effectiveFrom: "2026-01-01" }),
    });
    expect(res.status).toBe(404);
  });
});
