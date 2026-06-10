/**
 * tenant-guard-header-rename.test.ts — Tests for X-Workspace-ID → X-Budget-ID header rename
 *
 * TDD: Written RED before tenant-guard.ts is updated. Uses buildTenantGuard factory
 * with injected mock bootstrapFn (no real DB needed for header tests).
 *
 * D-10: After rename, X-Budget-ID accepted; X-Workspace-ID no longer read (leaves tenantIds empty).
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { ok } from "@budget/shared-kernel";
import { buildTenantGuard } from "../../src/middleware/tenant-guard";

// Mock bootstrap that returns ["budget-id-from-db"] when called
const mockBootstrap = async (
  _userId: string,
  fn: (tx: {
    execute: (q: unknown) => Promise<{ rows: unknown[] }>;
  }) => Promise<string[]>,
) => {
  const mockTx = {
    execute: async () => ({ rows: [{ id: "budget-id-from-db" }] }),
  };
  const value = await fn(mockTx);
  return ok(value);
};

// Mock bootstrap that returns [] (membership not found)
const emptyBootstrap = async (
  _userId: string,
  fn: (tx: {
    execute: (q: unknown) => Promise<{ rows: unknown[] }>;
  }) => Promise<string[]>,
) => {
  const mockTx = {
    execute: async () => ({ rows: [] }),
  };
  const value = await fn(mockTx);
  return ok(value);
};

function buildApp(bootstrap: typeof mockBootstrap) {
  const guard = buildTenantGuard(
    bootstrap as Parameters<typeof buildTenantGuard>[0],
  );
  const app = new Hono();
  app.use(async (c: any, next: any) => {
    c.set("session", { user: { id: "user-123", email: "test@example.com" } });
    await next();
  });
  app.use(guard);
  app.get("/test", (c: any) => c.json({ tenantIds: c.get("tenantIds") }));
  return app;
}

describe("Tenant guard header rename", () => {
  it("accepts X-Budget-ID and populates tenantIds", async () => {
    const app = buildApp(mockBootstrap);
    const res = await app.request("/test", {
      headers: { "X-Budget-ID": "some-budget-id" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // The bootstrap mock returns tenantIds from the DB query
    expect(body.tenantIds.length).toBeGreaterThan(0);
  });

  it("accepts x-budget-id lowercase and populates tenantIds", async () => {
    const app = buildApp(mockBootstrap);
    const res = await app.request("/test", {
      headers: { "x-budget-id": "some-budget-id" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.tenantIds.length).toBeGreaterThan(0);
  });

  it("rejects X-Workspace-ID — leaves tenantIds empty", async () => {
    // After rename, X-Workspace-ID is not read → tenantIds stays []
    const app = buildApp(mockBootstrap);
    const res = await app.request("/test", {
      headers: { "X-Workspace-ID": "some-workspace-id" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // X-Workspace-ID no longer read → tenantIds must be empty
    expect(body.tenantIds).toEqual([]);
  });

  it("sets tenantIds to [] when no header present", async () => {
    const app = buildApp(emptyBootstrap);
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.tenantIds).toEqual([]);
  });
});
