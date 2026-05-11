/**
 * budget-fetch.ts — CLIENT-safe helpers shared with server code.
 * Anything requiring next/headers lives in budget-fetch.server.ts.
 */

const BUDGET_PATH_RE = /^\/[a-z]{2}\/budgets\/([0-9a-fA-F-]{8,})/;

export function extractBudgetIdFromPath(pathname: string): string | null {
  const m = BUDGET_PATH_RE.exec(pathname);
  return m?.[1] ?? null;
}

/**
 * Browser-side fetch wrapper. Reads the budget ID from window.location.pathname
 * (/[locale]/budgets/[id]/...) and attaches it to every API call as
 * the X-Budget-ID header. Returns the raw Response.
 */
export async function clientApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof window !== "undefined") {
    const budgetId = extractBudgetIdFromPath(window.location.pathname);
    if (budgetId && !headers.has("X-Budget-ID")) {
      headers.set("X-Budget-ID", budgetId);
    }
  }
  return fetch(`/api${path}`, { ...init, headers });
}
