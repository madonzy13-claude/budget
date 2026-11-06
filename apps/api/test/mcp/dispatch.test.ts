/**
 * dispatch.test.ts — in-process route dispatch for MCP tools (15-02).
 *
 * dispatch() runs a request through the SAME middleware stack as the web app
 * (auth → tenantGuard → idempotency → route), authenticated as the MCP
 * connection's user via a WeakMap keyed on the Request object. Nothing outside
 * the process can put a Request into that map, so no header can forge it.
 *
 * Tests 4-5 hit real Postgres (DATABASE_URL_APP via `infisical run`).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";
import { trace } from "@opentelemetry/api";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, createIdempotencyMiddleware } = await import(
  "@budget/platform"
);
resetPools();

const { dispatch, internalRequests } = await import("../../src/mcp/dispatch");
const { authMiddleware } = await import("../../src/middleware/auth");
const { requireAuth } = await import("../../src/middleware/require-auth");
const { tenantGuard } = await import("../../src/middleware/tenant-guard");
const { requireWorkspace } = await import(
  "../../src/middleware/require-workspace"
);

// Cookie path stub: Better Auth never resolves a session in these tests, so any
// identity a probe sees can only have come from the internal WeakMap.
const deps = {
  identity: { auth: { api: { getSession: async () => null } } },
} as any;

async function createUserWithBudget(): Promise<{
  userId: string;
  budgetId: string;
}> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'MCP Dispatch', true, now(), now())`,
      [userId, `mcp-dispatch-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'MCP Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ws-mcp-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId };
}

function who(userId: string) {
  return {
    userId,
    clientId: "client-test",
    email: "agent@example.com",
    locale: "en" as const,
  };
}

/** Same order as createApp: auth → tenantGuard → idempotency → routes. */
function stackApp(onPost?: () => void) {
  const app = new Hono();
  app.use(authMiddleware(deps));
  app.use(tenantGuard);
  app.use(createIdempotencyMiddleware());
  app.use("/b/*", requireAuth, requireWorkspace);
  app.get("/b/probe", (c) => c.json({ tenantIds: c.get("tenantIds") }));
  app.post("/b/write", async (c) => {
    onPost?.();
    const body = await c.req.json();
    return c.json({ n: Math.random(), echo: body }, 201);
  });
  return app;
}

beforeAll(() => {
  trace.disable();
});

describe("MCP dispatch", () => {
  it("app.fetch exposes the same Request object as c.req.raw", async () => {
    let seen: Request | undefined;
    const app = new Hono();
    app.get("/x", (c) => {
      seen = c.req.raw;
      return c.text("ok");
    });
    const req = new Request("http://internal/x");
    await app.fetch(req);
    expect(seen).toBe(req);
  });

  it("authenticates the dispatched request as the given user", async () => {
    const app = new Hono();
    app.use(authMiddleware(deps));
    app.get("/probe", (c) => c.json({ id: c.get("session")?.user.id }));
    const res = await dispatch(app, who("user-123"), {
      method: "GET",
      path: "/probe",
    });
    expect(res).toEqual({ ok: true, status: 200, body: { id: "user-123" }, replayed: false });
  });

  it("ignores identity headers on an external request", async () => {
    const app = new Hono();
    app.use(authMiddleware(deps));
    app.get("/probe", requireAuth, (c) => c.json({ ok: true }));
    const res = await app.fetch(
      new Request("http://external/probe", {
        headers: {
          "x-mcp-user": "user-123",
          "x-user-id": "user-123",
          "x-mcp-client": "client-test",
        },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("carries a non-2xx status and the route's error through", async () => {
    const app = new Hono();
    app.use(authMiddleware(deps));
    app.get("/nope", (c) => c.json({ error: "category_not_found" }, 404));
    app.delete("/gone", (c) => c.body(null, 204));
    const res = await dispatch(app, who("u"), { method: "GET", path: "/nope" });
    expect(res).toEqual({
      ok: false,
      status: 404,
      body: { error: "category_not_found" },
      replayed: false,
    });
    const del = await dispatch(app, who("u"), {
      method: "DELETE",
      path: "/gone",
    });
    expect(del).toEqual({ ok: true, status: 204, body: null, replayed: false });
  });

  it("forwards query params", async () => {
    const app = new Hono();
    app.use(authMiddleware(deps));
    app.get("/q", (c) => c.json({ month: c.req.query("month") }));
    const res = await dispatch(app, who("u"), {
      method: "GET",
      path: "/q",
      query: { month: "2026-11" },
    });
    expect(res.body).toEqual({ month: "2026-11" });
  });

  it("does not leave the request registered after dispatch", async () => {
    let raw: Request | undefined;
    const app = new Hono();
    app.use(authMiddleware(deps));
    app.get("/p", (c) => {
      raw = c.req.raw;
      return c.text("ok");
    });
    await dispatch(app, who("u"), { method: "GET", path: "/p" });
    expect(internalRequests.has(raw!)).toBe(false);
  });

  it("tenantGuard still refuses another user's budget", async () => {
    const a = await createUserWithBudget();
    const b = await createUserWithBudget();
    const app = stackApp();
    const own = await dispatch(app, who(a.userId), {
      method: "GET",
      path: "/b/probe",
      budgetId: a.budgetId,
    });
    expect(own).toEqual({
      ok: true,
      status: 200,
      body: { tenantIds: [a.budgetId] },
      replayed: false,
    });
    const foreign = await dispatch(app, who(a.userId), {
      method: "GET",
      path: "/b/probe",
      budgetId: b.budgetId,
    });
    expect(foreign.status).toBe(403);
  });

  it("replays an Idempotency-Key through the real idempotency middleware", async () => {
    const a = await createUserWithBudget();
    let calls = 0;
    const app = stackApp(() => calls++);
    const key = crypto.randomUUID();
    const opts = {
      method: "POST" as const,
      path: "/b/write",
      budgetId: a.budgetId,
      body: { amount: "1.00" },
      idempotencyKey: key,
    };
    const first = await dispatch(app, who(a.userId), opts);
    const second = await dispatch(app, who(a.userId), opts);
    expect(first.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(calls).toBe(1);
    // Only the cached answer says so — a write tool must not log it twice.
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
  });
});
