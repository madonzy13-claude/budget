"use client";
/**
 * use-budgets-aggregate.ts — cross-budget "all budgets" aggregate (Task 13).
 *
 * useBudgetsAggregate() reads GET /budgets/aggregate (Task 7's rollup: every
 * budget the user belongs to, FX-converted into their display currency).
 * useSetAggregationFlag() flips a single budget's include_in_aggregation flag
 * (Task 8's PUT /budgets/:id/aggregation) and invalidates the aggregate query
 * so any other consumer (e.g. the settings toggle) stays in sync.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { clientApiWrite } from "@/lib/offline-write";

export interface AggregateBudgetRow {
  id: string;
  name: string;
  default_currency: string;
  member_count: number;
  my_share_pct: number;
  net_worth_cents: string;
  investments_cents: string;
  cash_cents: string;
  reserves_cents: string;
  cushion_cents: string;
  spent_month_cents: string;
  left_month_cents: string;
  overspent_total_cents: string;
  overspent_count: number;
  cushion_breached: boolean;
  reserves_status: "ok" | "short" | "surplus";
  pending_tasks: number;
  health: "red" | "amber" | "green";
  included: boolean;
  fx_unavailable: boolean;
}

export interface AllBudgetsAggregate {
  display_currency: string;
  budgets: AggregateBudgetRow[];
}

export function useBudgetsAggregate() {
  return useQuery({
    queryKey: ["budgets", "aggregate"],
    queryFn: async (): Promise<AllBudgetsAggregate> => {
      const res = await clientApiFetch("/budgets/aggregate");
      if (!res.ok) throw new Error("aggregate fetch failed");
      return res.json();
    },
  });
}

export function useSetAggregationFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      budgetId,
      included,
    }: {
      budgetId: string;
      included: boolean;
    }) =>
      clientApiWrite(`/budgets/${budgetId}/aggregation`, {
        method: "PUT",
        body: JSON.stringify({ included }),
      }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["budgets", "aggregate"] }),
  });
}
