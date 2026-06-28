"use client";
/**
 * use-overview-wealth.ts — lazy RQ hook for GET /budgets/:id/overview/wealth
 * (Phase 11, 11-06 endpoint). Range-scoped value series + capitalization/investments
 * view toggle. Fetches only when the section is open (`enabled`); range + view are
 * part of the query key so each view/range is cached independently (D-03).
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export type WealthView = "capitalization" | "investments";

export interface OverviewWealthDTO {
  currency: string;
  view: WealthView;
  bucket: "monthly" | "daily";
  series: { label: string; value_cents: string }[];
  grow: { delta_cents: string; delta_pct: number | null };
  monthly_avg_grow_pct: number | null;
  dynamics: { label: string; pct: number | null }[];
  pie: { holding_type: string; value_cents: string }[] | null;
}

export function useOverviewWealth(
  budgetId: string,
  opts: { from: string; to: string; view: WealthView; enabled: boolean },
) {
  const { from, to, view, enabled } = opts;
  return useQuery({
    queryKey: ["budget", budgetId, "overview", "wealth", from, to, view],
    enabled,
    queryFn: async () => {
      const qs = new URLSearchParams({ from, to, view });
      const res = await clientApiFetch(
        `/budgets/${budgetId}/overview/wealth?${qs.toString()}`,
        { headers: { "X-Budget-ID": budgetId } },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as OverviewWealthDTO;
    },
  });
}
