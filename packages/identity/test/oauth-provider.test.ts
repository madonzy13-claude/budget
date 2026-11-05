/**
 * oauth-provider.test.ts — Phase 15 (15-05): Better Auth as the OAuth 2.1
 * authorization server for MCP clients. Real Postgres (testcontainer), every
 * step through auth.handler — DCR, PKCE authorize, consent, token, refresh
 * rotation with replay detection.
 */
import { test, expect, beforeAll, describe } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender, UserId } from "@budget/shared-kernel";
import { LibsodiumKeyStore, withUserContext } from "@budget/platform";
import { createAuth } from "../src/adapters/persistence/better-auth";
import { signUp } from "../src/application/sign-up";
import { oauthBetterAuthSchema } from "../src/adapters/persistence/oauth-schema";
import { mcpOAuthPlugins } from "../src/adapters/persistence/oauth-provider";

const KEK = "A".repeat(43) + "=";
const BASE = "http://localhost:3000";
const RESOURCE = `${BASE}/mcp`;
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

let auth: ReturnType<typeof createAuth>;

beforeAll(async () => {
  process.env.BUDGET_KEK = KEK;
  process.env.BETTER_AUTH_SECRET = "test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.BETTER_AUTH_URL = BASE;
  process.env.APP_URL = BASE;
  process.env.AUTH_RATE_LIMIT_DISABLED = "true";
  await startTestcontainer();
  auth = createAuth({
    emailSender: new StdoutEmailSender(),
    keyStore: new LibsodiumKeyStore(KEK),
    additionalPlugins: mcpOAuthPlugins({ baseUrl: BASE }),
    additionalSchema: oauthBetterAuthSchema,
  });
}, 120_000);

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf as ArrayBuffer).toString("base64url");

async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return { verifier, challenge };
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return auth.handler(new Request(`${BASE}/auth${path}`, init));
}

async function signedInUser(): Promise<{ userId: string; cookie: string }> {
  const email = `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const r = await signUp(
    { auth },
    {
      email,
      password: "changeme1234",
      name: "OAuth",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  if (!r.isOk()) throw r.error;
  const userId = r.value.userId;
  const v = await withUserContext(UserId(userId), (tx) =>
    tx.execute(
      sql`UPDATE identity.users SET email_verified = true WHERE id = ${userId}::uuid`,
    ),
  );
  if (v.isErr()) throw v.error;
  const res = await call("/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: "changeme1234" }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { userId, cookie };
}

async function register(redirectUri = CALLBACK): Promise<Response> {
  return call("/oauth2/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Test MCP client",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
    }),
  });
}

async function authorize(
  clientId: string,
  cookie: string,
  scope: string | null,
  challenge?: string,
): Promise<Response> {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    state: "st",
    resource: RESOURCE,
  });
  if (scope !== null) q.set("scope", scope);
  if (challenge) {
    q.set("code_challenge", challenge);
    q.set("code_challenge_method", "S256");
  }
  return call(`/oauth2/authorize?${q}`, {
    headers: { cookie },
    redirect: "manual",
  });
}

function location(res: Response): URL {
  const loc = res.headers.get("location");
  if (loc) return new URL(loc, BASE);
  throw new Error(`no redirect (status ${res.status})`);
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  expires_in: number;
}

/** Full flow: register → authorize → consent → token. */
async function connect(
  scope: string | null,
): Promise<{ tokens: Tokens; clientId: string; userId: string }> {
  const { userId, cookie } = await signedInUser();
  const reg = (await (await register()).json()) as { client_id: string };
  const { verifier, challenge } = await pkce();
  const consentUrl = location(await authorize(reg.client_id, cookie, scope, challenge));
  expect(consentUrl.pathname).toBe("/oauth/consent");
  const consent = await call("/oauth2/consent", {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: BASE },
    body: JSON.stringify({
      accept: true,
      oauth_query: consentUrl.search.slice(1),
    }),
  });
  expect(consent.status).toBe(200);
  const { url } = (await consent.json()) as { url: string };
  const code = new URL(url).searchParams.get("code");
  expect(code).toBeTruthy();
  const tok = await call("/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code!,
      redirect_uri: CALLBACK,
      client_id: reg.client_id,
      code_verifier: verifier,
      resource: RESOURCE,
    }),
  });
  expect(tok.status).toBe(200);
  return { tokens: (await tok.json()) as Tokens, clientId: reg.client_id, userId };
}

function refresh(clientId: string, refreshToken: string): Promise<Response> {
  return call("/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      resource: RESOURCE,
    }),
  });
}

function jwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
}

describe("MCP OAuth authorization server", () => {
  test("anonymous dynamic client registration returns a client_id", async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(((await res.json()) as { client_id: string }).client_id).toBeTruthy();
  });

  test("redirect URIs: https or loopback http only", async () => {
    expect((await register("http://evil.example/cb")).ok).toBe(false);
    expect((await register("http://127.0.0.1:33418/cb")).status).toBe(201);
    expect((await register("http://localhost:6274/cb")).status).toBe(201);
  });

  test("authorize requires PKCE and sends a signed-in user to the consent page", async () => {
    const { cookie } = await signedInUser();
    const reg = (await (await register()).json()) as { client_id: string };
    const noPkce = await authorize(reg.client_id, cookie, "read");
    const noPkceLoc = noPkce.headers.get("location");
    expect(noPkceLoc === null || new URL(noPkceLoc, BASE).searchParams.has("error")).toBe(true);

    const { challenge } = await pkce();
    const consent = location(await authorize(reg.client_id, cookie, "read", challenge));
    expect(consent.pathname).toBe("/oauth/consent");
    expect(consent.searchParams.get("client_id")).toBe(reg.client_id);
    expect(consent.searchParams.get("scope")).toContain("read");
  });

  test("consent + PKCE exchange yields a JWT for /mcp and a refresh token", async () => {
    const { tokens, clientId, userId } = await connect("read");
    expect(tokens.refresh_token).toBeTruthy();
    const p = jwtPayload(tokens.access_token);
    expect(p.aud === RESOURCE || (Array.isArray(p.aud) && p.aud.includes(RESOURCE))).toBe(true);
    expect(p.sub).toBe(userId);
    expect(p.azp).toBe(clientId);
    expect(String(p.scope)).toContain("read");
  });

  test("write scope is grantable; unknown scopes are refused", async () => {
    const { tokens } = await connect("read write");
    expect(tokens.scope).toContain("write");

    const { cookie } = await signedInUser();
    const reg = (await (await register()).json()) as { client_id: string };
    const { challenge } = await pkce();
    const res = await authorize(reg.client_id, cookie, "admin", challenge);
    expect(location(res).searchParams.get("error")).toBe("invalid_scope");
  });

  test("refresh rotates, and replaying the old refresh token is refused", async () => {
    const { tokens, clientId } = await connect("read");
    const r1 = await refresh(clientId, tokens.refresh_token!);
    expect(r1.status).toBe(200);
    const next = (await r1.json()) as Tokens;
    expect(next.access_token).not.toBe(tokens.access_token);
    expect(next.refresh_token).toBeTruthy();
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    const replay = await refresh(clientId, tokens.refresh_token!);
    expect(replay.ok).toBe(false);
  });

  test("consent spans all budgets: one row per (user, client), no reference id", async () => {
    const { userId, clientId } = await connect("read");
    const r = await withUserContext(UserId(userId), (tx) =>
      tx.execute(
        sql`SELECT reference_id FROM identity.oauth_consent
            WHERE user_id = ${userId}::uuid AND client_id = ${clientId}`,
      ),
    );
    if (r.isErr()) throw r.error;
    expect(r.value.rows.length).toBe(1);
    expect(r.value.rows[0]!.reference_id).toBeNull();
  });
});
