import { cookies } from "next/headers";

export interface ServerSessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  locale?: string;
  displayCurrency?: string;
  /** IANA zone (e.g. "Europe/Kyiv"). Seeds the current-month rollover so it
   *  follows the user's local calendar, not UTC (r31 item 1). */
  timezone?: string;
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
/**
 * One get-session attempt. Returns the raw response body text on a 2xx, `null`
 * when the API definitively says "no session" (2xx with empty/null body, or a
 * 4xx — the API is up, it just rejects this cookie). Throws ServerUnavailableError
 * for an unreachable API / 5xx / timeout so the caller shows /server-down rather
 * than logging the user out.
 */
async function fetchSessionTextOnce(
  cookieHeader: string,
  disableCookieCache: boolean,
): Promise<string | null> {
  const apiBase = process.env["API_INTERNAL_URL"] ?? "http://api:4000";
  // Better Auth caches the session (incl. user fields like displayCurrency and
  // locale) in a signed cookie for `cookieCache.maxAge` (60s). Reads served from
  // that cache stay STALE for up to 60s after a settings PUT that updates the DB
  // directly (the PUT bypasses Better Auth, so it never refreshes the cache).
  // Pages that must reflect a just-saved value (Settings) pass
  // disableCookieCache so get-session reads the row fresh from the DB.
  const url = disableCookieCache
    ? `${apiBase}/auth/get-session?disableCookieCache=true`
    : `${apiBase}/auth/get-session`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
      // Bound the call: a hung auth fetch must become server-down, not an
      // indefinite RSC hang that blanks the page.
      signal: AbortSignal.timeout(6000),
    });
  } catch (e) {
    // Network-layer failure: DNS, ECONNREFUSED, TLS error, or the 6s timeout
    // abort. The API container is unreachable / too slow from the web container.
    // Surface as a typed error so the caller can redirect to /server-down
    // instead of the misleading /sign-in?reason=session_expired bounce.
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

  if (res.status === 429) {
    // Rate-limited (throttled), NOT "no session". get-session is now exempted
    // from Better Auth's limiter (see better-auth.ts customRules), but treat a
    // 429 from anywhere (edge/proxy) defensively: NEVER log the user out for a
    // throttle. Surface it as a transient unavailable so the retry / server-down
    // retry path handles it instead of the /sign-in bounce.
    console.warn(
      `[server-session] 429 (throttled) from ${apiBase}/auth/get-session — not logging out`,
    );
    throw new ServerUnavailableError("Auth service throttled (429)");
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
  return text;
}

/**
 * get-session with a single retry on a `null` result (see the spurious-logout
 * note in getServerSession). ServerUnavailableError propagates immediately — a
 * down/5xx API is a server-down condition, not a retryable "no session". Only a
 * `null` (4xx / empty body) is retried once, to absorb a transient blip before
 * we trust it as a real logout.
 */
async function fetchSessionTextWithRetry(
  cookieHeader: string,
  disableCookieCache: boolean,
): Promise<string | null> {
  const first = await fetchSessionTextOnce(cookieHeader, disableCookieCache);
  if (first !== null) return first;
  // Brief backoff, then one more attempt before trusting the null.
  await new Promise((r) => setTimeout(r, 200));
  return fetchSessionTextOnce(cookieHeader, disableCookieCache);
}

export async function getServerSession(
  options: { disableCookieCache?: boolean } = {},
): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!cookieHeader) return null;

  // SPURIOUS-LOGOUT HARDENING (260619): this runs in the (app) layout on EVERY
  // navigation (force-dynamic). A SINGLE transient get-session miss — a flaky
  // edge hop, a sub-second DB blip, a post-sign-in cookie/replication race —
  // used to return null and bounce the user to /sign-in?reason=session_expired
  // mid-session ("sometimes logged out moving between pages" + "had to sign in
  // twice"). A genuinely expired/revoked session returns null DETERMINISTICALLY,
  // so we retry ONCE before trusting a null: a real logout still logs out (null
  // twice), but a transient blip self-heals. Also bound each attempt with a
  // timeout so a hung auth call becomes server-down, not an infinite hang.
  const text = await fetchSessionTextWithRetry(
    cookieHeader,
    options.disableCookieCache ?? false,
  );
  if (text === null) return null;
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
    // emailVerified / email_verified
    if (u["emailVerified"] === undefined && u["email_verified"] !== undefined) {
      u["emailVerified"] = u["email_verified"];
    }
    // timezone / time_zone (defensive — the column is one word, but the adapter
    // casing mode could still snake it).
    if (u["timezone"] === undefined && u["time_zone"] !== undefined) {
      u["timezone"] = u["time_zone"];
    }
  }
  return raw as unknown as ServerSession;
}
