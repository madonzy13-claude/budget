"use client";
/**
 * use-active-budgets.ts — the home budget list (SPA refactor 260616).
 *
 * queryKey: ["active-budgets"]
 * GET /budgets/active → BudgetSummary[]. Replaces the SSR fetchActiveBudgets +
 * HomeOfflineCache path: the persisted React Query cache renders the list
 * instantly on re-nav / cold reload and React Query handles offline (paused
 * fetch keeps the cached list). 03-02 dual-emit: budgets ?? workspaces.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import type { BudgetSummary } from "@/components/budgeting/budget-switcher";

export function useActiveBudgets() {
  return useQuery({
    queryKey: ["active-budgets"],
    queryFn: async (): Promise<BudgetSummary[]> => {
      const res = await clientApiFetch("/budgets/active", {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error("active_budgets_fetch_failed");
      const body = (await res.json()) as {
        budgets?: BudgetSummary[];
        workspaces?: BudgetSummary[];
      };
      return body.budgets ?? body.workspaces ?? [];
    },
    staleTime: 30_000,
    // Reflect background task changes (added/removed while away) when the user
    // returns to the app — feeds the app-icon badge (r31 item 2).
    refetchOnWindowFocus: true,
  });
}
