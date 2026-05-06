/**
 * tenant-guard.test.ts — unit tests for tenantGuard middleware
 * Uses Hono test helpers with mocked withBootstrapUserContext (no live DB).
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";
import { ok, err } from "@budget/shared-kernel";

// Mock @budget/platform withBootstrapUserContext before importing tenant-guard
let mockBootstrapImpl:
  | ((
      userId: string,
      fn: (tx: unknown) => Promise<string[]>,
    ) => Promise<unknown>)
  | null = null;

mock.module("@budget/platform", () => ({
  withBootstrapUserContext: async (
    userId: string,
    fn: (tx: unknown) => Promise<string[]>,
  ) => {
    if (mockBootstrapImpl) {
      return mockBootstrapImpl(userId, fn);
    }
    // Default: call fn with a mock tx returning two workspace IDs
    try {
      const mockTx = {
        execute: async () => ({ rows: [{ ids: ["ws-001", "ws-002"] }] }),
      };
      const value = await fn(mockTx);
      return ok(value);
    } catch (e) {
      return err(e as Error);
    }
  },
  appPool: () => ({
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    }),
  }),
  libsodiumReady: async () => {},
  LibsodiumKeyStore: class {},
}));

// Import AFTER mocking
const { tenantGuard } = await import("../../src/middleware/tenant-guard");

describe("tenantGuard middleware", () => {
  beforeEach(() => {
    mockBootstrapImpl = null;
  });

  it("sets tenantIds to [] when no session", async () => {
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", null);
      await next();
    });
    app.use(tenantGuard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { tenantIds: string[] };
    expect(body.tenantIds).toEqual([]);
  });

  it("intersects active_workspace_ids with memberships and sets tenantIds", async () => {
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", {
        user: {
          id: "user-123",
          email: "test@example.com",
          locale: "en" as const,
        },
      });
      await next();
    });
    app.use(tenantGuard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { tenantIds: string[] };
    // Default mock returns ['ws-001', 'ws-002']
    expect(body.tenantIds).toEqual(["ws-001", "ws-002"]);
  });

  it("sets tenantIds to [] when bootstrap returns empty array", async () => {
    mockBootstrapImpl = async (
      _userId: string,
      fn: (tx: unknown) => Promise<string[]>,
    ) => {
      const mockTx = {
        execute: async () => ({ rows: [{ ids: null }] }),
      };
      const value = await fn(mockTx);
      return ok(value);
    };

    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", {
        user: { id: "user-no-ws", email: "x@y.com", locale: "en" as const },
      });
      await next();
    });
    app.use(tenantGuard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { tenantIds: string[] };
    expect(body.tenantIds).toEqual([]);
  });

  it("falls back to [] on bootstrap error (result.isOk() = false)", async () => {
    mockBootstrapImpl = async () => {
      return err(new Error("DB error"));
    };

    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", {
        user: { id: "user-err", email: "e@r.com", locale: "en" as const },
      });
      await next();
    });
    app.use(tenantGuard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { tenantIds: string[] };
    // On error, tenant-guard falls back to [] gracefully
    expect(body.tenantIds).toEqual([]);
    expect(res.status).toBe(200);
  });
});
