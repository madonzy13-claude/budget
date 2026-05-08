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
    return JSON.parse(text) as ServerSession;
  } catch (e) {
    console.error("[server-session] fetch error", e);
    return null;
  }
}
