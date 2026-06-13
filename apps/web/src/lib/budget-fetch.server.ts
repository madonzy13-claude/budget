/**
 * budget-fetch.server.ts — SERVER-only fetch wrapper. Imports next/headers
 * (cookies()) so it MUST NOT appear in any client bundle. Use only inside
 * RSC pages or server actions.
 */
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { BudgetSummary } from "@/components/budgeting/budget-switcher";

const SERVER_API_BASE = process.env["API_INTERNAL_URL"] ?? "http://api:4000";

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
  if (cookieHeader && !headers.has("Cookie"))
    headers.set("Cookie", cookieHeader);
  if (budgetId && !headers.has("X-Budget-ID"))
    headers.set("X-Budget-ID", budgetId);
  return fetch(`${SERVER_API_BASE}${path}`, {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });
}

/**
 * fetchActiveBudgets — request-scoped deduplicated fetch of /budgets/active.
 *
 * PERF 260613-dn1 #3: layout.tsx (onboarding guard) and page.tsx (home grid)
 * both called serverApiFetch(null, "/budgets/active") independently — two serial
 * round-trips per home render (~2000ms × 2). React cache() deduplicates within
 * a SINGLE request render tree (each request gets its own cache scope, so
 * per-user dynamic data stays correct). Layout renders before page; the page
 * call is a cache HIT → zero extra round-trip.
 *
 * 03-02 dual-emit fallback: read `budgets ?? workspaces` until legacy key removed.
 */
export const fetchActiveBudgets = cache(async (): Promise<BudgetSummary[]> => {
  const res = await serverApiFetch(null, "/budgets/active");
  if (!res.ok) return [];
  const body = (await res.json()) as {
    budgets?: BudgetSummary[];
    workspaces?: BudgetSummary[];
  };
  return body.budgets ?? body.workspaces ?? [];
});
