"use client";
/**
 * use-budget-data.ts — per-entity budget queries: useBudget + useCategories.
 *
 * SPA/SWR (260616): plain client fetches. Offline is handled by React Query
 * networkMode + the persisted query cache (query-persist.ts) — the old bespoke
 * IndexedDB read-back, markSynced sync-meta, and the (unused) useBudgetData
 * snapshot aggregator were removed.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface BudgetDto {
  id: string;
  name: string;
  currency: string;
  [key: string]: unknown;
}

export interface CategoryDto {
  id: string;
  name: string;
  [key: string]: unknown;
}

/**
 * Fetch the budget row itself.
 * queryKey: ["budget", budgetId, "detail"]
 */
export function useBudget(budgetId: string, initialData?: BudgetDto) {
  return useQuery({
    queryKey: ["budget", budgetId, "detail"] as const,
    initialData,
    queryFn: async (): Promise<BudgetDto> => {
      const res = await clientApiFetch(`/budgets/${budgetId}`, {
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) throw new Error("budget_fetch_failed");
      const json = await res.json();
      return json.budget ?? json;
    },
    staleTime: 60_000,
    // 260625: cache-first + always background-revalidate on mount. The restore-
    // gate (QueryProvider IsRestoringProvider) hydrates the IDB snapshot before
    // any fetch, so the budget detail / categories paint instantly from cache and
    // are then replaced by a fresh fetch — without this the staleTime:60s window
    // kept a just-hydrated STALE value (e.g. the pre-rename budget name) on screen
    // after a reload (budget-settings "name persists after reload" regression).
    // Offline is unaffected: networkMode pauses the refetch, cache stays visible.
    refetchOnMount: "always",
  });
}

/**
 * Fetch the categories list for a budget.
 * queryKey: ["budget", budgetId, "categories"] — the SAME key the spendings grid
 * reads (localCategoryOrder) and the create/edit/delete/reorder mutations
 * invalidate.
 */
export function useCategories(budgetId: string, initialData?: CategoryDto[]) {
  return useQuery({
    queryKey: ["budget", budgetId, "categories"] as const,
    initialData,
    queryFn: async (): Promise<CategoryDto[]> => {
      const res = await clientApiFetch(`/budgets/${budgetId}/categories`, {
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) throw new Error("categories_fetch_failed");
      const json = await res.json();
      return json.categories ?? [];
    },
    staleTime: 60_000,
    // 260625: cache-first + always background-revalidate on mount. The restore-
    // gate (QueryProvider IsRestoringProvider) hydrates the IDB snapshot before
    // any fetch, so the budget detail / categories paint instantly from cache and
    // are then replaced by a fresh fetch — without this the staleTime:60s window
    // kept a just-hydrated STALE value (e.g. the pre-rename budget name) on screen
    // after a reload (budget-settings "name persists after reload" regression).
    // Offline is unaffected: networkMode pauses the refetch, cache stays visible.
    refetchOnMount: "always",
  });
}
