import { cookies } from "next/headers";

export interface ServerSessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  locale?: string;
  displayCurrency?: string;
  preferredLlmProvider?: string | null;
  preferredSttProvider?: string | null;
}

export interface ServerSession {
  user: ServerSessionUser;
}

/**
 * Thrown by getServerSession when the API container itself is unreachable
 * (network error, DNS, connect-refused) or returns a 5xx. The caller is
 * expected to catch this and redirect to /[locale]/server-down — the friendly
 * "we can't reach the server" screen — instead of treating it as "no session"
 * and bouncing the user to /sign-in (which itself depends on the API to be
 * useful, producing a confusing dead-end on mobile).
 *
 * A 4xx response (401, 403, etc.) is NOT a server-down condition — the API is
 * up, it just doesn't accept this cookie. getServerSession returns null in
 * that case and the existing /sign-in?reason=session_expired flow handles it.
 */
export class ServerUnavailableError extends Error {
  override readonly name = "ServerUnavailableError";
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

/**
 * Server-side session fetch for RSC pages. Calls Better Auth's /auth/get-session
 * directly on the api container (API_INTERNAL_URL) instead of looping back
 * through the public origin — this avoids same-host fetch quirks and the
 * trusted-origins check applied at the public edge.
 *
 * Return contract:
 *   - ServerSession  → signed-in
 *   - null           → no session (no cookie, 4xx, or empty body)
 *   - throws ServerUnavailableError → API container unreachable / 5xx — caller
 *     should redirect to /server-down rather than /sign-in.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!cookieHeader) return null;

  const apiBase = process.env["API_INTERNAL_URL"] ?? "http://api:4000";
  let res: Response;
  try {
    res = await fetch(`${apiBase}/auth/get-session`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
  } catch (e) {
    // Network-layer failure: DNS, ECONNREFUSED, timeout, TLS error. The API
    // container is unreachable from the web container. Surface as a typed
    // error so the caller can redirect to /server-down instead of the
    // misleading /sign-in?reason=session_expired bounce.
    console.error("[server-session] fetch error", e);
    throw new ServerUnavailableError(
      `Unable to reach auth service at ${apiBase}`,
      e,
    );
  }

  if (res.status >= 500) {
    // API is up enough to respond but its session endpoint is broken (DB
    // down, panic, etc.). Same UX as a network failure — show server-down.
    console.error(
      `[server-session] 5xx status from ${apiBase}/auth/get-session: ${res.status}`,
    );
    throw new ServerUnavailableError(`Auth service returned ${res.status}`);
  }

  if (!res.ok) {
    console.warn(
      `[server-session] non-ok status from ${apiBase}/auth/get-session: ${res.status}`,
    );
    return null;
  }
  const text = await res.text();
  if (!text || text === "null") {
    console.warn(
      `[server-session] empty/null body from get-session (cookie len=${cookieHeader.length})`,
    );
    return null;
  }
  // Better Auth 1.6.x may return additionalFields in snake_case (from the raw DB
  // column names) instead of the camelCase keys declared in additionalFields config,
  // depending on the Drizzle adapter's casing mode.  Normalise here so callers always
  // get camelCase regardless of which form the API returns.
  const raw = JSON.parse(text) as {
    user?: Record<string, unknown>;
    [k: string]: unknown;
  };
  if (raw?.user) {
    const u = raw.user;
    // displayCurrency / display_currency
    if (
      u["displayCurrency"] === undefined &&
      u["display_currency"] !== undefined
    ) {
      u["displayCurrency"] = u["display_currency"];
    }
    // preferredLlmProvider / preferred_llm_provider
    if (
      u["preferredLlmProvider"] === undefined &&
      u["preferred_llm_provider"] !== undefined
    ) {
      u["preferredLlmProvider"] = u["preferred_llm_provider"];
    }
    // preferredSttProvider / preferred_stt_provider
    if (
      u["preferredSttProvider"] === undefined &&
      u["preferred_stt_provider"] !== undefined
    ) {
      u["preferredSttProvider"] = u["preferred_stt_provider"];
    }
    // emailVerified / email_verified
    if (u["emailVerified"] === undefined && u["email_verified"] !== undefined) {
      u["emailVerified"] = u["email_verified"];
    }
  }
  return raw as unknown as ServerSession;
}
