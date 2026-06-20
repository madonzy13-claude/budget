/**
 * budget-fetch.ts — CLIENT-safe helpers shared with server code.
 * Anything requiring next/headers lives in budget-fetch.server.ts.
 */
import { reportApiUnreachable, reportApiOk } from "./api-unreachable-bus";

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
  try {
    const res = await fetch(`/api${path}`, { ...init, headers });
    // 5xx ⇒ the server itself is failing; 2xx/3xx/4xx ⇒ the API is reachable
    // (4xx is auth/validation, NOT a server-down signal).
    if (res.status >= 500) reportApiUnreachable();
    else reportApiOk();
    return res;
  } catch (e) {
    // Network failure / abort / DNS — the API is unreachable.
    reportApiUnreachable();
    throw e;
  }
}
