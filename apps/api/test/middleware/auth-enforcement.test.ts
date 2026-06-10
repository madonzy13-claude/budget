/**
 * auth-enforcement.test.ts — gate tests for requireAuth + requireWorkspace + serverError.
 *
 * Regression for UAT 02 finding T3:
 *   GET /api/accounts returned 500 with raw Drizzle SQL when no active workspace
 *   was bound. After this fix, the same call must:
 *     - return 401 when no session
 *     - return 403 when no active workspace
 *     - return a sanitized 500 envelope (no raw SQL leaked) on internal error
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { requireAuth } from "../../src/middleware/require-auth";
import { requireWorkspace } from "../../src/middleware/require-workspace";
import { serverError } from "../../src/middleware/server-error";

describe("requireAuth", () => {
  it("returns 401 when session is null", async () => {
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", null);
      await next();
    });
    app.use(requireAuth);
    app.get("/protected", (c) => c.json({ ok: true }));

    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("passes through when session is present", async () => {
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", { user: { id: "u1", email: "a@b.com" } });
      await next();
    });
    app.use(requireAuth);
    app.get("/protected", (c) => c.json({ ok: true }));

    const res = await app.request("/protected");
    expect(res.status).toBe(200);
  });
});

describe("requireWorkspace", () => {
  it("returns 403 when tenantIds is empty", async () => {
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", { user: { id: "u1" } });
      c.set("tenantIds", []);
      await next();
    });
    app.use(requireWorkspace);
    app.get("/protected", (c) => c.json({ ok: true }));

    const res = await app.request("/protected");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no_active_workspace");
  });

  it("returns 403 when tenantIds is undefined", async () => {
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", { user: { id: "u1" } });
      // tenantIds intentionally not set
      await next();
    });
    app.use(requireWorkspace);
    app.get("/protected", (c) => c.json({ ok: true }));

    const res = await app.request("/protected");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no_active_workspace");
  });

  it("returns 403 when tenantIds[0] is empty string", async () => {
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", { user: { id: "u1" } });
      c.set("tenantIds", [""]);
      await next();
    });
    app.use(requireWorkspace);
    app.get("/protected", (c) => c.json({ ok: true }));

    const res = await app.request("/protected");
    expect(res.status).toBe(403);
  });

  it("passes through when first tenantId is non-empty", async () => {
    const app = new Hono();
    app.use(async (c, next) => {
      c.set("session", { user: { id: "u1" } });
      c.set("tenantIds", ["ws-1"]);
      await next();
    });
    app.use(requireWorkspace);
    app.get("/protected", (c) => c.json({ ok: true }));

    const res = await app.request("/protected");
    expect(res.status).toBe(200);
  });
});

describe("serverError envelope", () => {
  it("does NOT include raw error message or SQL in the response body", async () => {
    const app = new Hono();
    app.get("/boom", (c) => {
      const drizzleLikeError = new Error(
        "Failed query: SELECT id, tenant_id FROM budgeting.accounts WHERE tenant_id = $1::uuid\nparams: ",
      );
      return serverError(c, "list_accounts_failed", drizzleLikeError);
    });

    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    // Sanitized envelope: opaque code only, never the raw error string.
    expect(body.error).toBe("internal_error");
    expect(body.code).toBe("list_accounts_failed");
    const text = JSON.stringify(body);
    expect(text).not.toContain("Failed query");
    expect(text).not.toContain("budgeting.accounts");
    expect(text).not.toContain("tenant_id");
    expect(text).not.toContain("SELECT");
  });
});
