"use client";
/**
 * use-projection.ts — TanStack Query hook for the Overview cash-flow projection.
 * queryKey: ["budget", budgetId, "projection"]. Mirrors use-spendings-summary.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface ProjectionDay {
  date: string;
  color: "green" | "yellow" | "red";
  available_cents: string;
  income_cents: string;
  bill_cents: string;
  drew_reserve: { category_id: string; name: string; amount_cents: string }[];
  shortfall: { category_id: string; name: string; amount_cents: string }[];
}

export interface ProjectionDTO {
  currency: string;
  days: ProjectionDay[];
  income_points: { date: string; name: string; amount_cents: string }[];
  bill_points: {
    date: string;
    name: string;
    category_id: string | null;
    amount_cents: string;
  }[];
  summary: {
    first_yellow_date: string | null;
    first_red_date: string | null;
    worst_shortfall_cents: string;
  };
}

export async function fetchProjection(
  budgetId: string,
): Promise<ProjectionDTO> {
  const res = await clientApiFetch(`/budgets/${budgetId}/overview/projection`);
  if (!res.ok) throw new Error("projection_fetch_failed");
  return await res.json();
}

export function useProjection(budgetId: string) {
  return useQuery({
    queryKey: ["budget", budgetId, "projection"] as const,
    queryFn: () => fetchProjection(budgetId),
    staleTime: 60_000,
  });
}
