/**
 * auth.test.ts — 15-07: the /mcp endpoint accepts only AS-issued tokens for
 * this resource, acts as the token's user (D-01/D-03), and rate-limits per
 * connection (D-24).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import {
  setupMcpTestEnv,
  testApp,
  testDeps,
  baseUrl,
  mcpResource,
  signUpTestUser,
  seedBudget,
  mintMcpToken,
  createSdkClient,
  jwtPayload,
} from "./helpers";

await setupMcpTestEnv();
const { clearRateLimits } = await import("../../src/middleware/rate-limit");

let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp();
});

function postMcp(token?: string): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      new Request(`${baseUrl()}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    ),
  );
}

/** Signed with the AS's own keys — only the claims are wrong. */
async function signWithAsKeys(payload: Record<string, unknown>) {
  const deps = await testDeps();
  const r = await (deps.identity.auth as any).api.signJWT({
    body: { payload },
  });
  return r.token as string;
}

function textOf(result: { content?: Array<{ type: string; text?: string }> }) {
  return result.content?.map((c) => c.text ?? "").join("") ?? "";
}

describe("MCP endpoint authentication", () => {
  it("challenges a request without a token with the resource metadata URL", async () => {
    const res = await postMcp();
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      `resource_metadata="${baseUrl()}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it("rejects garbage, wrong-audience and expired tokens", async () => {
    expect((await postMcp("not-a-jwt")).status).toBe(401);
    const user = await signUpTestUser(app);
    const real = jwtPayload((await mintMcpToken(app, user, ["read"])).accessToken);
    const now = Math.floor(Date.now() / 1000);
    const wrongAud = await signWithAsKeys({
      ...real,
      aud: "https://other/x",
      iat: now,
      exp: now + 300,
    });
    expect((await postMcp(wrongAud)).status).toBe(401);
    const expired = await signWithAsKeys({
      ...real,
      iat: now - 1200,
      exp: now - 600,
    });
    expect((await postMcp(expired)).status).toBe(401);
  });

  it("lists list_budgets as a read-only tool for a valid token", async () => {
    const user = await signUpTestUser(app);
    const { accessToken } = await mintMcpToken(app, user, ["read"]);
    const client = await createSdkClient(app, accessToken);
    const { tools } = await client.listTools();
    const lb = tools.find((t) => t.name === "list_budgets");
    expect(lb).toBeDefined();
    expect(lb!.annotations?.readOnlyHint).toBe(true);
  });

  it("acts as the token's user across all their budgets, including new ones", async () => {
    const user = await signUpTestUser(app);
    const other = await signUpTestUser(app);
    const first = await seedBudget(user.userId, { name: "Home" });
    const foreign = await seedBudget(other.userId, { name: "Not yours" });
    const { accessToken } = await mintMcpToken(app, user, ["read"]);
    const client = await createSdkClient(app, accessToken);

    const call = async () => {
      const r = await client.callTool({ name: "list_budgets", arguments: {} });
      return (r.structuredContent as { budgets: Array<Record<string, any>> })
        .budgets;
    };
    const before = await call();
    expect(before.map((b) => b.budget_id)).toEqual([first]);
    expect(before[0]).toMatchObject({
      name: { untrusted_user_text: "Home" },
      currency: "EUR",
      role: "owner",
    });

    const later = await seedBudget(user.userId, { name: "Later" });
    const after = (await call()).map((b) => b.budget_id);
    expect(after.sort()).toEqual([first, later].sort());
    expect(after).not.toContain(foreign);
  });

  it("rate-limits reads per connection (61st call in a minute)", async () => {
    clearRateLimits();
    const user = await signUpTestUser(app);
    const a = await mintMcpToken(app, user, ["read"]);
    const b = await mintMcpToken(app, user, ["read"]);
    const client = await createSdkClient(app, a.accessToken);
    for (let i = 0; i < 60; i++) {
      const r = await client.callTool({ name: "list_budgets", arguments: {} });
      expect(r.isError).toBeFalsy();
    }
    const limited = await client.callTool({ name: "list_budgets", arguments: {} });
    expect(limited.isError).toBe(true);
    expect(textOf(limited as any)).toContain("rate_limited");
    expect(textOf(limited as any)).toContain("retry_after_seconds");

    const otherClient = await createSdkClient(app, b.accessToken);
    const fine = await otherClient.callTool({ name: "list_budgets", arguments: {} });
    expect(fine.isError).toBeFalsy();
  });

  it("issues tokens for the /mcp resource", async () => {
    const user = await signUpTestUser(app);
    const p = jwtPayload((await mintMcpToken(app, user, ["read"])).accessToken);
    expect([p.aud].flat()).toContain(mcpResource());
  });
});
