/**
 * oauth-lifetime.test.ts — 15-05 Task 3 spike: D-06 "connection lives until
 * the user disconnects", measured against the real provider instead of assumed.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import {
  setupMcpTestEnv,
  testApp,
  signUpTestUser,
  mintMcpToken,
  refreshMcpToken,
  refreshRows,
  jwtPayload,
  mcpResource,
} from "./helpers";

await setupMcpTestEnv();

const YEAR_MS = 365 * 24 * 3600 * 1000;
let app: Awaited<ReturnType<typeof testApp>>;

beforeAll(async () => {
  app = await testApp();
});

describe("MCP token lifetime", () => {
  it("mint helper returns a JWT with aud …/mcp", async () => {
    const user = await signUpTestUser(app);
    const t = await mintMcpToken(app, user, ["read"]);
    const p = jwtPayload(t.accessToken);
    const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
    expect(aud).toContain(mcpResource());
    expect(p.sub).toBe(user.userId);
  });

  it("a client that never asks for offline_access still gets a refresh token", async () => {
    const user = await signUpTestUser(app);
    const t = await mintMcpToken(app, user, ["read"], { requestScope: "read" });
    expect(t.refreshToken).toBeTruthy();
    const noScope = await mintMcpToken(app, user, ["read"], {
      requestScope: null,
    });
    expect(noScope.refreshToken).toBeTruthy();
  });

  it("access tokens last at most 10 minutes", async () => {
    const user = await signUpTestUser(app);
    const t = await mintMcpToken(app, user, ["read"]);
    expect(t.expiresIn).toBeLessThanOrEqual(600);
  });

  it("refresh expiry is sliding: every rotation gets a fresh 10y", async () => {
    const user = await signUpTestUser(app);
    const t = await mintMcpToken(app, user, ["read"]);
    await Bun.sleep(1100); // expiry has second resolution
    const res = await refreshMcpToken(app, t.clientId, t.refreshToken);
    expect(res.status).toBe(200);
    const rows = await refreshRows(user.userId, t.clientId);
    expect(rows.length).toBe(2);
    const [first, second] = rows as [
      (typeof rows)[number],
      (typeof rows)[number],
    ];
    const firstLife = first.expires_at.getTime() - first.created_at.getTime();
    expect(firstLife).toBeGreaterThan(9 * YEAR_MS);
    expect(second.expires_at.getTime() - Date.now()).toBeGreaterThan(9 * YEAR_MS);
    expect(second.expires_at.getTime()).toBeGreaterThan(
      first.expires_at.getTime(),
    );
  });
});
