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
  /** The terms of the day's arithmetic, which the tooltip reads out:
   *  available = opening + income − bill − planned_burn − pending + reserve_covered. */
  opening_cents: string;
  planned_burn_cents: string;
  /** Unanswered occurrences charged that day — the FIRST day only. Optional: a
   *  payload cached before this existed replays without it, and the term is
   *  simply absent from the block. */
  pending_cents?: string;
  reserve_covered_cents: string;
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
  /** Scheduled occurrences whose date passed with no confirmation. Their money
   *  already rides inside the daily planned spend, so they are informational —
   *  the tooltip shows them on today's cell. Optional: an offline cache written
   *  by an older build has no such field. */
  pending_points?: {
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
  /**
   * What can leave the budget TODAY with every dip in the 100-day window still
   * covered — the lowest point of a worst-case run (each month's plan spendable
   * the moment the month opens). Negative = you are short by that much. Optional:
   * an offline cache written by an older build has no such field.
   */
  safe_to_withdraw?: { cents: string; thinnest_date: string | null };
  /** "Available to spend" card health (dot + surplus/deficit). `good` is null and
   *  `surplus_deficit_cents` is null when there is no upcoming income (grey dot,
   *  card falls back to its "upcoming" figure). */
  spend_health: {
    good: boolean | null;
    surplus_deficit_cents: string | null;
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
    // The projection depends on wallets, reserves, income, scheduled rules and
    // spend, changed from many surfaces (often other tabs). Cache-first but always
    // revalidate on return to the tab / focus so a budget change is reflected
    // without threading invalidation through every mutation. Mutation hooks also
    // invalidate ["budget", id, "projection"] for same-tab live updates.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
