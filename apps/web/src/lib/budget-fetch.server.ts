/**
 * budget-fetch.server.ts — SERVER-only fetch wrapper. Imports next/headers
 * (cookies()) so it MUST NOT appear in any client bundle. Use only inside
 * RSC pages or server actions.
 */
import "server-only";
import { cookies } from "next/headers";

const SERVER_API_BASE =
  process.env["API_INTERNAL_URL"] ?? "http://api:4000";

export async function serverApiFetch(
  budgetId: string | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const headers = new Headers(init.headers);
  if (cookieHeader && !headers.has("Cookie")) headers.set("Cookie", cookieHeader);
  if (budgetId && !headers.has("X-Budget-ID")) headers.set("X-Budget-ID", budgetId);
  return fetch(`${SERVER_API_BASE}${path}`, {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });
}
