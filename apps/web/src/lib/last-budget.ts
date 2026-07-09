/**
 * last-budget.ts — remembers the budget the user was last in (r35), so the home
 * landing (app reopen) reopens it instead of the listing. localStorage: the home
 * redirect is client-side, so no cookie is needed.
 */
export const LAST_BUDGET_KEY = "last-budget-id";

/**
 * Best-effort persist (private mode / disabled storage → no-op). Writes BOTH a
 * cookie (so the RSC home page can server-redirect with NO flicker) and
 * localStorage (client fallback / other reads).
 */
export function rememberLastBudget(budgetId: string): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_BUDGET_KEY, budgetId);
      // 1-year cookie, lax so a top-level reopen sends it. Read by page.tsx.
      document.cookie = `${LAST_BUDGET_KEY}=${budgetId}; path=/; max-age=31536000; samesite=lax`;
    }
  } catch {
    /* ignore */
  }
}
