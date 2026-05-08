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
 * Server-side session fetch for RSC pages. Calls Better Auth's /auth/get-session
 * directly on the api container (API_INTERNAL_URL) instead of looping back
 * through the public origin — this avoids same-host fetch quirks and the
 * trusted-origins check applied at the public edge. Returns null when there
 * is no signed-in user.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!cookieHeader) return null;

  const apiBase = process.env["API_INTERNAL_URL"] ?? "http://api:4000";
  try {
    const res = await fetch(`${apiBase}/auth/get-session`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
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
      if (
        u["emailVerified"] === undefined &&
        u["email_verified"] !== undefined
      ) {
        u["emailVerified"] = u["email_verified"];
      }
    }
    return raw as unknown as ServerSession;
  } catch (e) {
    console.error("[server-session] fetch error", e);
    return null;
  }
}
