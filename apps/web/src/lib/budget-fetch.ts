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

/** The budget id in an API path we are about to request: `/budgets/<id>/…`.
 *  A uuid only — `/budgets/aggregate` and `/budgets/aggregate/wealth` carry no
 *  budget and must not be mistaken for one. */
const API_BUDGET_RE =
  /^\/budgets\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(\/|$)/;

export function extractBudgetIdFromApiPath(path: string): string | null {
  return API_BUDGET_RE.exec(path)?.[1] ?? null;
}

/**
 * Browser-side fetch wrapper. Attaches X-Budget-ID, which the tenant guard needs
 * on every budget-scoped call. Returns the raw Response.
 *
 * The id is taken from the REQUESTED PATH first (`/budgets/<uuid>/…`) and only
 * then from window.location. The path is what the caller actually asked for; the
 * browser URL is a guess about it, and the guess was wrong wherever a page shows
 * data for a budget it is not sitting on. The all-budgets page renders a task
 * banner per budget, each resolving category names, and with no budget in `/en`
 * every one of those calls went out with no header and came back 403
 * no_active_workspace — then retried (user screenshot, 260827).
 *
 * An explicit header still wins: a caller that knows better keeps control.
 */
export async function clientApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("X-Budget-ID")) {
    const budgetId =
      extractBudgetIdFromApiPath(path) ??
      (typeof window !== "undefined"
        ? extractBudgetIdFromPath(window.location.pathname)
        : null);
    if (budgetId) headers.set("X-Budget-ID", budgetId);
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
