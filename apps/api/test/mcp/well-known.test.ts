/**
 * well-known.test.ts — 15-07: MCP clients discover the protected resource
 * (RFC 9728) and the authorization server (RFC 8414) from the API, no cookie.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { setupMcpTestEnv, testApp, baseUrl } from "./helpers";

await setupMcpTestEnv();

let app: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  app = await testApp();
});

async function get(path: string): Promise<Response> {
  return app.fetch(new Request(`${baseUrl()}${path}`));
}

describe("MCP discovery metadata", () => {
  for (const path of [
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-protected-resource",
  ]) {
    it(`serves protected-resource metadata at ${path}`, async () => {
      const res = await get(path);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.resource).toBe(`${baseUrl()}/mcp`);
      expect(body.authorization_servers).toEqual([`${baseUrl()}/auth`]);
      expect(body.scopes_supported).toEqual(
        expect.arrayContaining(["read", "write"]),
      );
    });
  }

  for (const path of [
    "/.well-known/oauth-authorization-server/auth",
    "/.well-known/oauth-authorization-server",
  ]) {
    it(`serves authorization-server metadata at ${path}`, async () => {
      const res = await get(path);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.issuer).toBe(`${baseUrl()}/auth`);
      expect(body.registration_endpoint).toBe(
        `${baseUrl()}/auth/oauth2/register`,
      );
      expect(body.token_endpoint).toBe(`${baseUrl()}/auth/oauth2/token`);
      expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    });
  }
});
