import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server-side guard: redirects the user to /[locale]/onboarding when their
 * session has no active workspace bound. Use at the top of any RSC page that
 * calls a workspace-scoped API route — without this guard the API legitimately
 * returns 403 `no_active_workspace` and the user sees a broken/empty page.
 *
 * Implementation: hits the cheapest workspace-scoped GET (`/accounts`).
 *   200 → has active workspace, return.
 *   403 → no active workspace, redirect to /[locale]/onboarding.
 *   401 → caller's session is bad; the (app)/layout already handles that.
 *   anything else (incl. network failure) → permissive, let the page render
 *   and surface its own error so we don't trap users on transient outages.
 */
export async function requireActiveWorkspace(locale: string): Promise<void> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!cookieHeader) return; // layout already handles unauth

  const apiBase = process.env["API_INTERNAL_URL"] ?? "http://api:4000";
  let status: number;
  try {
    const res = await fetch(`${apiBase}/accounts`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    status = res.status;
  } catch {
    return; // permissive on network error
  }
  if (status === 403) {
    redirect(`/${locale}/onboarding`);
  }
}
