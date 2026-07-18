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
  overspent_top_name: string | null;
  overspent_top_cents: string;
  cushion_breached: boolean;
  reserves_status: "ok" | "short" | "surplus";
  reserves_required_cents: string;
  cushion_required_cents: string;
  cushion_saved_full_cents: string;
  cushion_required_full_cents: string;
  cushion_real_months: number;
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

export interface AggregateWealthSeriesPoint {
  label: string;
  value_cents: string;
}

export interface AggregateWealth {
  display_currency: string;
  series: AggregateWealthSeriesPoint[];
  grow: { delta_cents: string; delta_pct: number };
  /** Investments view only. */
  invested_cents: string | null;
  pie: { holding_type: string; value_cents: string }[] | null;
}

/** Combined net-worth trend over an explicit [from, to] window (YYYY-MM-DD).
 *  The hero P/L passes a today-only window; the chart passes the range selector's
 *  window. `view` picks capitalization vs investments; `net` subtracts
 *  contributions (investments view). `grow` comes back range-scoped. */
export function useAggregateWealth(
  includeIds: string[],
  from: string,
  to: string,
  view: "capitalization" | "investments" = "capitalization",
  net = false,
) {
  return useQuery({
    queryKey: [
      "budgets",
      "aggregate",
      "wealth",
      from,
      to,
      view,
      net,
      [...includeIds].sort().join(","),
    ],
    enabled: includeIds.length > 0 && !!from && !!to,
    queryFn: async (): Promise<AggregateWealth> => {
      const params = new URLSearchParams({
        from,
        to,
        view,
        include: includeIds.join(","),
      });
      if (net) params.set("net", "1");
      const res = await clientApiFetch(`/budgets/aggregate/wealth?${params}`);
      if (!res.ok) throw new Error("aggregate wealth failed");
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
