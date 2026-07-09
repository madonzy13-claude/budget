"use client";
/**
 * use-overview-cards.ts — TanStack Query hook for GET /budgets/:id/overview/cards
 * (Phase 11, 11-03 endpoint). The five Overview summary cards, all in the budget
 * default_currency. Persisted RQ + background revalidate (D-03); warmed in the
 * priority prefetch tier (use-prefetch-budget-tabs) so the pill is warm before tap.
 *
 * queryKey: ["budget", budgetId, "overview", "cards"]
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface OverviewCardsDTO {
  default_currency: string;
  available_to_spend_cents: string;
  spendings: {
    spent_cents: string;
    left_cents: string;
    wallet_cents: string;
    good: boolean;
  };
  capitalization_cents: string;
  investment_value_cents: string;
  retirement_months: number | null;
  retirement_inflation_pct: number;
  available_reserves_cents: string;
  reserves: {
    required_cents: string;
    wallet_cents: string;
    status: "ok" | "short" | "surplus";
  };
  cushion: {
    enabled: boolean;
    real_months: number;
    total_cents: string;
    required_cents: string;
    covered: boolean;
  };
  overspent: {
    count: number;
    currency: string;
    total_cents: string;
    top: { category_id: string; name: string; over_amount_cents: string }[];
  };
}

export const overviewCardsQueryKey = (budgetId: string) =>
  ["budget", budgetId, "overview", "cards"] as const;

export async function fetchOverviewCards(
  budgetId: string,
): Promise<OverviewCardsDTO> {
  const res = await clientApiFetch(`/budgets/${budgetId}/overview/cards`, {
    headers: { "X-Budget-ID": budgetId },
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as OverviewCardsDTO;
}

export function useOverviewCards(budgetId: string) {
  return useQuery({
    queryKey: overviewCardsQueryKey(budgetId),
    queryFn: () => fetchOverviewCards(budgetId),
    // Cache-first paint on carousel switch + background revalidate (symmetric with
    // use-reserves-summary): wallet/cushion/spend mutations change these figures.
    refetchOnMount: "always",
  });
}
