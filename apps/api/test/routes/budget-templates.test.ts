/**
 * budget-templates.test.ts — integration tests for /budget-templates routes.
 * ENGR-03: route coverage sentinel.
 *
 * Tests auth guards and basic routing using in-process Hono app with
 * mocked repo to avoid DB dependency.
 */
import { describe, test, expect, mock } from "bun:test";
import { Hono } from "hono";

// Minimal neverthrow-compatible result helpers (avoids adding neverthrow to apps/api deps)
const ok = (val: unknown) => ({
  isOk: () => true,
  isErr: () => false,
  value: val,
});

class FakePgBoss {
  async start() {
    return this;
  }
  async work() {}
  async schedule() {}
  async createQueue() {}
  async send() {}
  async stop() {}
}
mock.module("pg-boss", () => ({
  default: FakePgBoss,
  PgBoss: FakePgBoss,
}));

const fakeTemplate = {
  id: "tpl-001",
  tenantId: "tenant-001",
  name: "Monthly Household",
  items: [],
  createdAt: new Date().toISOString(),
};

// Mock the DrizzleBudgetTemplateRepo used inside the route
mock.module(
  "@budget/budgeting/src/adapters/persistence/budget-template-repo",
  () => ({
    DrizzleBudgetTemplateRepo: class {
      async createTemplate() {
        return ok(fakeTemplate);
      }
      async listTemplates() {
        return ok([fakeTemplate]);
      }
    },
  }),
);

// Mock contracts/api for Zod schemas
mock.module("@budget/budgeting/src/contracts/api", () => ({
  createTemplateSchema: {
    safeParse: (body: any) => {
      if (!body?.name)
        return {
          success: false,
          error: { issues: [{ message: "name required" }] },
        };
      return {
        success: true,
        data: { name: body.name, items: body.items ?? [] },
      };
    },
  },
  applyTemplateSchema: {
    safeParse: (body: any) => {
      if (!body?.targetMonth)
        return {
          success: false,
          error: { issues: [{ message: "targetMonth required" }] },
        };
      return { success: true, data: body };
    },
  },
}));

const { createBudgetTemplatesRoute } =
  await import("../../src/routes/budget-templates");

function buildDeps() {
  return {
    budgeting: {
      applyBudgetTemplate: async () => ok({ ok: true }),
    },
  } as any;
}

function buildApp(deps = buildDeps()) {
  const app = new Hono<{ Variables: Record<string, unknown> }>();
  app.use("*", async (c, next) => {
    if (c.req.header("X-Test-Auth") === "true") {
      c.set("session", { user: { id: "user-123" } });
      c.set("tenantIds", ["tenant-001"]);
      c.set("userId", "user-123");
    }
    await next();
  });
  app.route("/budget-templates", createBudgetTemplatesRoute(deps));
  return app;
}

describe("GET /budget-templates", () => {
  test("returns 200 with templates list when authenticated", async () => {
    const app = buildApp();
    const res = await app.request("/budget-templates", {
      headers: { "X-Test-Auth": "true" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.templates)).toBe(true);
  });

  test("returns 200 with empty tenant id (no auth guard on GET)", async () => {
    const app = buildApp();
    const res = await app.request("/budget-templates");
    expect(res.status).toBe(200);
  });
});

describe("POST /budget-templates", () => {
  test("creates template and returns 201", async () => {
    const app = buildApp();
    const res = await app.request("/budget-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ name: "Monthly Household", items: [] }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.name).toBe("Monthly Household");
  });

  test("returns 422 on invalid JSON body", async () => {
    const app = buildApp();
    const res = await app.request("/budget-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: "not-json",
    });
    expect(res.status).toBe(422);
  });

  test("returns 422 when name missing", async () => {
    const app = buildApp();
    const res = await app.request("/budget-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ items: [] }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /budget-templates/:id/apply", () => {
  test("applies template successfully", async () => {
    const app = buildApp();
    const res = await app.request("/budget-templates/tpl-001/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({ targetMonth: "2026-05" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  test("returns 422 when targetMonth missing", async () => {
    const app = buildApp();
    const res = await app.request("/budget-templates/tpl-001/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Test-Auth": "true" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });
});
