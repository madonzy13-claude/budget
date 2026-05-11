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
  fn: (tx: {
    execute: (q: unknown) => Promise<{ rows: unknown[] }>;
  }) => Promise<string[]>,
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
    const guard = buildTenantGuard(
      mockBootstrap as Parameters<typeof buildTenantGuard>[0],
    );
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

  it("accepts X-Budget-ID header and verifies membership, sets tenantIds", async () => {
    // D-10: After rename, X-Budget-ID is the accepted header (not active_workspace_ids).
    // Default mockBootstrap returns rows when fn is called → tenantIds populated.
    const guard = buildTenantGuard(
      mockBootstrap as Parameters<typeof buildTenantGuard>[0],
    );
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

    // Send X-Budget-ID header — guard looks up membership and sets tenantIds
    const res = await app.request("/test", {
      headers: { "X-Budget-ID": "budget-001" },
    });
    const body = (await res.json()) as { tenantIds: string[] };
    // bootstrap mock executes fn → fn reads rows [{...}] → returns ["budget-001"]
    // (the guard returns [requestedBudgetId] when rows.length > 0)
    expect(body.tenantIds).toEqual(["budget-001"]);
  });

  it("sets tenantIds to [] when X-Budget-ID header present but membership not found", async () => {
    // Guard sends X-Budget-ID to DB lookup; if no membership rows → returns []
    mockBootstrapImpl = async (
      _userId: string,
      fn: (tx: {
        execute: (q: unknown) => Promise<{ rows: unknown[] }>;
      }) => Promise<string[]>,
    ) => {
      const mockTx = {
        execute: async () => ({ rows: [] }), // no membership found
      };
      const value = await fn(mockTx);
      return ok(value);
    };

    const guard = buildTenantGuard(
      mockBootstrap as Parameters<typeof buildTenantGuard>[0],
    );
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", {
        user: { id: "user-no-ws", email: "x@y.com", locale: "en" as const },
      });
      await next();
    });
    app.use(guard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test", {
      headers: { "X-Budget-ID": "non-member-budget" },
    });
    const body = (await res.json()) as { tenantIds: string[] };
    expect(body.tenantIds).toEqual([]);
  });

  it("falls back to [] on bootstrap error (result.isOk() = false)", async () => {
    mockBootstrapImpl = async () => {
      return err(new Error("DB error"));
    };

    const guard = buildTenantGuard(
      mockBootstrap as Parameters<typeof buildTenantGuard>[0],
    );
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", {
        user: { id: "user-err", email: "e@r.com", locale: "en" as const },
      });
      await next();
    });
    app.use(guard);
    app.get("/test", (c) => c.json({ tenantIds: c.get("tenantIds") }));

    const res = await app.request("/test", {
      headers: { "X-Budget-ID": "some-budget" },
    });
    const body = (await res.json()) as { tenantIds: string[] };
    // On error, tenant-guard falls back to [] gracefully
    expect(body.tenantIds).toEqual([]);
    expect(res.status).toBe(200);
  });
});
