/**
 * workspaces.test.ts — smoke tests for /workspaces routes
 * Tests: POST / with valid body → 201, missing session → 401, invalid kind → 400
 */
import { describe, it, expect, mock } from "bun:test";
import { Hono } from "hono";

// Mock @budget/platform to avoid real DB
mock.module("@budget/platform", () => ({
  withBootstrapUserContext: async (
    _userId: string,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    const mockTx = {
      execute: async () => ({ rows: [{ ids: ["ws-001"] }] }),
    };
    const { ok } = await import("@budget/shared-kernel");
    return ok(await fn(mockTx));
  },
  appPool: () => ({
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    }),
  }),
  libsodiumReady: async () => {},
  LibsodiumKeyStore: class {},
  withUserContext: async (
    _id: unknown,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    const { ok } = await import("@budget/shared-kernel");
    return ok(await fn({}));
  },
  withTenantTx: async (
    _id: unknown,
    _uid: unknown,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    const { ok } = await import("@budget/shared-kernel");
    return ok(await fn({}));
  },
}));

const { workspacesRoutesFactory } = await import("../../src/routes/workspaces");

function buildApp(session: unknown) {
  const app = new Hono();

  // Inject session
  app.use(async (c, next) => {
    c.set("session", session as any);
    await next();
  });

  // Mock tenantGuard
  app.use(async (c, next) => {
    c.set("tenantIds", session ? ["ws-001"] : []);
    await next();
  });

  // Mock deps with a fake createWorkspace
  const mockCreate = mock(async () => {
    const { ok } = await import("@budget/shared-kernel");
    return ok({ workspaceId: "new-ws-id" });
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
            id: "new-ws-id",
            ...opts.body,
          }),
        },
      },
    },
    _mockCreate: mockCreate,
  } as any;

  app.route("/workspaces", workspacesRoutesFactory(fakeDeps));
  return app;
}

describe("POST /workspaces", () => {
  it("returns 201 with valid body and session", async () => {
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
    expect(res.status).toBe(201);
  });

  it("returns 401 when no session", async () => {
    const app = buildApp(null);
    const res = await app.request("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Workspace",
        kind: "PRIVATE",
        default_currency: "USD",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 with invalid kind (zod validation)", async () => {
    const app = buildApp({
      user: { id: "user-001", email: "test@test.com", locale: "en" },
    });
    const res = await app.request("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Workspace",
        kind: "INVALID_KIND",
        default_currency: "USD",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 with missing required fields", async () => {
    const app = buildApp({
      user: { id: "user-001", email: "test@test.com", locale: "en" },
    });
    const res = await app.request("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Missing fields" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /workspaces/active", () => {
  it("returns 200 with session", async () => {
    const app = buildApp({
      user: { id: "user-001", email: "test@test.com", locale: "en" },
    });
    const res = await app.request("/workspaces/active");
    expect(res.status).toBe(200);
  });

  it("returns 401 without session", async () => {
    const app = buildApp(null);
    const res = await app.request("/workspaces/active");
    expect(res.status).toBe(401);
  });
});
