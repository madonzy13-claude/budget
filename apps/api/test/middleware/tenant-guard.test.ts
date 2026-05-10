/**
 * tenant-guard.test.ts — unit tests for tenantGuard middleware
 * Uses buildTenantGuard factory with injected mock bootstrapFn (no live DB, no mock.module).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { ok, err } from "@budget/shared-kernel";
import { buildTenantGuard } from "../../src/middleware/tenant-guard";

type BootstrapImpl = (
  userId: string,
  fn: (tx: { execute: (q: unknown) => Promise<{ rows: unknown[] }> }) => Promise<string[]>,
) => Promise<ReturnType<typeof ok | typeof err>>;

let mockBootstrapImpl: BootstrapImpl | null = null;

const mockBootstrap: BootstrapImpl = async (userId, fn) => {
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
};

describe("tenantGuard middleware", () => {
  beforeEach(() => {
    mockBootstrapImpl = null;
  });

  it("sets tenantIds to [] when no session", async () => {
    const guard = buildTenantGuard(mockBootstrap as Parameters<typeof buildTenantGuard>[0]);
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", null);
      await next();
    });
    app.use(guard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { tenantIds: string[] };
    expect(body.tenantIds).toEqual([]);
  });

  it("intersects active_workspace_ids with memberships and sets tenantIds", async () => {
    const guard = buildTenantGuard(mockBootstrap as Parameters<typeof buildTenantGuard>[0]);
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
    app.use(guard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { tenantIds: string[] };
    // Default mock returns ['ws-001', 'ws-002']
    expect(body.tenantIds).toEqual(["ws-001", "ws-002"]);
  });

  it("sets tenantIds to [] when bootstrap returns empty array", async () => {
    mockBootstrapImpl = async (
      _userId: string,
      fn: (tx: { execute: (q: unknown) => Promise<{ rows: unknown[] }> }) => Promise<string[]>,
    ) => {
      const mockTx = {
        execute: async () => ({ rows: [{ ids: null }] }),
      };
      const value = await fn(mockTx);
      return ok(value);
    };

    const guard = buildTenantGuard(mockBootstrap as Parameters<typeof buildTenantGuard>[0]);
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", {
        user: { id: "user-no-ws", email: "x@y.com", locale: "en" as const },
      });
      await next();
    });
    app.use(guard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { tenantIds: string[] };
    expect(body.tenantIds).toEqual([]);
  });

  it("falls back to [] on bootstrap error (result.isOk() = false)", async () => {
    mockBootstrapImpl = async () => {
      return err(new Error("DB error"));
    };

    const guard = buildTenantGuard(mockBootstrap as Parameters<typeof buildTenantGuard>[0]);
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", {
        user: { id: "user-err", email: "e@r.com", locale: "en" as const },
      });
      await next();
    });
    app.use(guard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test");
    const body = (await res.json()) as { tenantIds: string[] };
    // On error, tenant-guard falls back to [] gracefully
    expect(body.tenantIds).toEqual([]);
    expect(res.status).toBe(200);
  });
});
