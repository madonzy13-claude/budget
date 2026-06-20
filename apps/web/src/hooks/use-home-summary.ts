"use client";
/**
 * use-home-summary.ts — per-card home summary (SPA refactor 260616).
 *
 * queryKey: ["home-summary", budgetId]
 * GET /budgets/:id/home-summary. One query per BudgetCard so a slow card never
 * blocks its siblings (replaces the per-card server Suspense streaming). Offline
 * + re-nav served from the persisted React Query cache.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface HomeSummary {
  budgetId: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
  display_currency: string;
  spent_current_month: { amount_cents: string; currency: string };
  wallets_value_display_ccy: {
    amount_cents: string;
    currency: string;
    converted_at: string;
  };
  top_overspent: Array<{
    category_id: string;
    category_name: string;
    over_amount_cents: string;
  }>;
}

export function useHomeSummary(budgetId: string) {
  return useQuery({
    queryKey: ["home-summary", budgetId],
    queryFn: async (): Promise<HomeSummary> => {
      // The home route is `/[locale]` (no budget in the path), so clientApiFetch
      // can't infer X-Budget-ID — set it explicitly per card or RLS 404s.
      const res = await clientApiFetch(`/budgets/${budgetId}/home-summary`, {
        headers: { "X-Budget-ID": budgetId },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error("home_summary_fetch_failed");
      return (await res.json()) as HomeSummary;
    },
    staleTime: 30_000,
  });
}
