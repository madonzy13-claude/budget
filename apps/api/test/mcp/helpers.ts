/**
 * helpers.ts — shared MCP test setup. Real Postgres, real OAuth flow through
 * the real app (createApp(await boot())); no token is ever inserted by hand.
 *
 * Requires DATABASE_URL_APP etc. (`infisical run --env=dev --`).
 */
import { Pool } from "pg";
import { trace } from "@opentelemetry/api";

type App = { fetch(r: Request): Response | Promise<Response> };

export const MCP_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

/** Call BEFORE importing anything that opens a pool. */
export async function setupMcpTestEnv(): Promise<void> {
  for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER"]) {
    const v = process.env[k];
    if (v) process.env[k] = v.replace("@db:", "@localhost:");
  }
  if (!process.env.DATABASE_URL_APP)
    throw new Error("DATABASE_URL_APP required for MCP integration tests");
  process.env.AUTH_RATE_LIMIT_DISABLED = "true";
  // Not in Infisical; normally from the repo-root .env, absent under apps/api.
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.APP_URL ??= process.env.BETTER_AUTH_URL;
  const { resetPools } = await import("@budget/platform");
  resetPools();
  trace.disable();
}

export function baseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

export function mcpResource(): string {
  return `${baseUrl()}/mcp`;
}

/** The real app, booted once per test file. */
let appPromise: Promise<App> | undefined;
export function testApp(): Promise<App> {
  appPromise ??= (async () => {
    const { boot } = await import("../../src/boot");
    const { createApp } = await import("../../src/app");
    return createApp(await boot());
  })();
  return appPromise;
}

async function withClient<T>(
  fn: (c: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

function req(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("origin", process.env.APP_URL ?? baseUrl());
  return new Request(`${baseUrl()}${path}`, { ...init, headers });
}

export interface TestUser {
  userId: string;
  cookie: string;
  email: string;
}

/** Sign up through /auth, verify the email directly, sign in for a cookie. */
export async function signUpTestUser(
  app: App,
  email = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
): Promise<TestUser> {
  const password = "changeme1234";
  const up = await app.fetch(
    req("/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "MCP Test" }),
    }),
  );
  if (!up.ok) throw new Error(`sign-up ${up.status}: ${await up.text()}`);
  const { user } = (await up.json()) as { user: { id: string } };
  await withClient(async (c) => {
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      user.id,
    ]);
    await c.query(
      `UPDATE identity.users SET email_verified = true WHERE id = $1`,
      [user.id],
    );
  });
  const inRes = await app.fetch(
    req("/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  if (!inRes.ok) throw new Error(`sign-in ${inRes.status}: ${await inRes.text()}`);
  const cookie = inRes.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { userId: user.id, cookie, email };
}

/** A budget owned by `userId` (budget + owner membership in one tx). */
export async function seedBudget(
  userId: string,
  opts: { currency?: string; name?: string } = {},
): Promise<string> {
  const budgetId = crypto.randomUUID();
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, $3, 'PRIVATE', $4, $5, 1, now())`,
      [
        budgetId,
        `ws-mcp-${budgetId.slice(0, 8)}`,
        opts.name ?? "MCP Budget",
        opts.currency ?? "EUR",
        userId,
      ],
    );
    await c.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
  });
  return budgetId;
}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf as ArrayBuffer).toString("base64url");

export interface McpTokens {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  expiresIn: number;
  scope: string;
}

/** DCR → authorize (user cookie) → consent → PKCE token exchange. */
export async function mintMcpToken(
  app: App,
  user: TestUser,
  scopes: ("read" | "write")[],
  opts: { requestScope?: string | null; clientName?: string } = {},
): Promise<McpTokens> {
  const reg = await app.fetch(
    req("/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: opts.clientName ?? "Test MCP client",
        redirect_uris: [MCP_CALLBACK],
        token_endpoint_auth_method: "none",
      }),
    }),
  );
  if (reg.status !== 201) throw new Error(`register ${reg.status}: ${await reg.text()}`);
  const { client_id: clientId } = (await reg.json()) as { client_id: string };

  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: MCP_CALLBACK,
    state: "st",
    resource: mcpResource(),
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const requestScope =
    opts.requestScope === undefined ? scopes.join(" ") : opts.requestScope;
  if (requestScope !== null) q.set("scope", requestScope);
  const auth = await app.fetch(
    req(`/auth/oauth2/authorize?${q}`, {
      headers: { cookie: user.cookie },
      redirect: "manual",
    }),
  );
  const consentLoc = auth.headers.get("location");
  if (!consentLoc) throw new Error(`authorize ${auth.status}: ${await auth.text()}`);
  const consentUrl = new URL(consentLoc, baseUrl());
  if (consentUrl.searchParams.has("error"))
    throw new Error(`authorize error: ${consentUrl.search}`);

  const consent = await app.fetch(
    req("/auth/oauth2/consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: user.cookie },
      body: JSON.stringify({
        accept: true,
        oauth_query: consentUrl.search.slice(1),
      }),
    }),
  );
  if (!consent.ok) throw new Error(`consent ${consent.status}: ${await consent.text()}`);
  const { url } = (await consent.json()) as { url: string };
  const code = new URL(url).searchParams.get("code");
  if (!code) throw new Error(`consent gave no code: ${url}`);

  const tok = await app.fetch(
    req("/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: MCP_CALLBACK,
        client_id: clientId,
        code_verifier: verifier,
        resource: mcpResource(),
      }),
    }),
  );
  if (!tok.ok) throw new Error(`token ${tok.status}: ${await tok.text()}`);
  const t = (await tok.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    clientId,
    expiresIn: t.expires_in,
    scope: t.scope,
  };
}

/** refresh_token grant through the app. */
export function refreshMcpToken(
  app: App,
  clientId: string,
  refreshToken: string,
): Promise<Response> {
  return Promise.resolve(
    app.fetch(
      req("/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          resource: mcpResource(),
        }),
      }),
    ),
  );
}

export function jwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
}

/** Refresh-token rows as postgres sees them (expiry measurement). */
export async function refreshRows(
  userId: string,
  clientId: string,
): Promise<Array<{ created_at: Date; expires_at: Date; revoked: Date | null }>> {
  return withClient(async (c) => {
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    const r = await c.query(
      `SELECT created_at, expires_at, revoked FROM identity.oauth_refresh_token
        WHERE user_id = $1 AND client_id = $2 ORDER BY created_at`,
      [userId, clientId],
    );
    return r.rows;
  });
}
