/**
 * connected-apps.test.ts — 15-08: Settings → Connected apps (D-21).
 * Per-user list + Disconnect, where Disconnect takes effect immediately even
 * for an access token that has not expired yet. Real app, real OAuth flow.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import {
  setupMcpTestEnv,
  testApp,
  baseUrl,
  signUpTestUser,
  seedBudget,
  mintMcpToken,
  refreshMcpToken,
  type TestUser,
} from "../mcp/helpers";

await setupMcpTestEnv();

let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp();
});

function call(
  user: TestUser | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (user) headers.set("cookie", user.cookie);
  return Promise.resolve(
    app.fetch(new Request(`${baseUrl()}${path}`, { ...init, headers })),
  );
}

async function connections(user: TestUser) {
  const res = await call(user, "/settings/connected-apps");
  expect(res.status).toBe(200);
  return ((await res.json()) as { connections: Array<Record<string, any>> })
    .connections;
}

function mcpList(token: string): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      new Request(`${baseUrl()}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    ),
  );
}

async function addMember(budgetId: string, userId: string): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  try {
    await pool.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'member', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
  } finally {
    await pool.end();
  }
}

describe("Connected apps", () => {
  it("lists the user's own connections only", async () => {
    const a = await signUpTestUser(app);
    const b = await signUpTestUser(app);
    const shared = await seedBudget(a.userId);
    await addMember(shared, b.userId);
    const t = await mintMcpToken(app, a, ["read"], { clientName: "Claude" });

    const list = await connections(a);
    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({
      client_id: t.clientId,
      client_name: "Claude",
    });
    expect(list[0]!.scopes).toContain("read");
    expect(Date.parse(list[0]!.connected_at)).toBeGreaterThan(0);
    expect(Date.parse(list[0]!.last_used_at)).toBeGreaterThan(0);

    expect(await connections(b)).toEqual([]);
    expect((await call(null, "/settings/connected-apps")).status).toBe(401);
  });

  it("disconnect revokes immediately, including a live access token", async () => {
    const a = await signUpTestUser(app);
    const t = await mintMcpToken(app, a, ["read"]);
    expect((await mcpList(t.accessToken)).status).toBe(200);

    const del = await call(a, `/settings/connected-apps/${t.clientId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    expect(await connections(a)).toEqual([]);
    expect((await mcpList(t.accessToken)).status).toBe(401);
    expect((await refreshMcpToken(app, t.clientId, t.refreshToken)).ok).toBe(
      false,
    );
  });

  it("another user's disconnect is a no-op", async () => {
    const a = await signUpTestUser(app);
    const b = await signUpTestUser(app);
    const t = await mintMcpToken(app, a, ["read"]);
    const del = await call(b, `/settings/connected-apps/${t.clientId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    expect((await connections(a)).map((c) => c.client_id)).toEqual([t.clientId]);
  });

  it("reconnecting with write after a disconnect lists the new scope", async () => {
    const a = await signUpTestUser(app);
    const t = await mintMcpToken(app, a, ["read"]);
    await call(a, `/settings/connected-apps/${t.clientId}`, { method: "DELETE" });
    await mintMcpToken(app, a, ["read", "write"]);
    const list = await connections(a);
    expect(list.length).toBe(1);
    expect(list[0]!.scopes).toContain("write");
  });

  it("describes a client for the consent screen", async () => {
    const a = await signUpTestUser(app);
    const t = await mintMcpToken(app, a, ["read"], { clientName: "Cursor" });
    const res = await call(a, `/settings/connected-apps/client/${t.clientId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      client_id: t.clientId,
      client_name: "Cursor",
      redirect_hosts: ["claude.ai"],
    });
    expect(
      (await call(a, "/settings/connected-apps/client/nope")).status,
    ).toBe(404);
  });
});
