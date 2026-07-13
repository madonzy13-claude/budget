"use client";
/**
 * use-overview-wealth.ts — lazy RQ hook for GET /budgets/:id/overview/wealth
 * (Phase 11, 11-06 endpoint). Range-scoped value series + capitalization/investments
 * view toggle. Fetches only when the section is open (`enabled`); range + view are
 * part of the query key so each view/range is cached independently (D-03).
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export type WealthView = "capitalization" | "investments";

export interface OverviewWealthDTO {
  currency: string;
  view: WealthView;
  bucket: "1h" | "12h" | "24h";
  dynamicsBucket: "daily" | "monthly" | "yearly";
  series: { label: string; value_cents: string }[];
  grow: { delta_cents: string; delta_pct: number | null };
  /** FW-section growth anchored on the opening value (chart start); hero uses `grow`. */
  grow_from_open: { delta_cents: string; delta_pct: number | null };
  monthly_avg_grow_pct: number | null;
  dynamics: { label: string; pct: number | null; delta_cents: string }[];
  pie: { holding_type: string; value_cents: string }[] | null;
  /** Σ contributions (Investments-category spend) over the range; null when the
   *  budget has no Investments category. Investments view only. */
  invested_cents: string | null;
}

export function useOverviewWealth(
  budgetId: string,
  opts: {
    from: string;
    to: string;
    view: WealthView;
    enabled: boolean;
    /** Investments view: fetch the net-of-contributions series/growth/dynamics. */
    net?: boolean;
  },
) {
  const { from, to, view, enabled, net = false } = opts;
  return useQuery({
    queryKey: ["budget", budgetId, "overview", "wealth", from, to, view, net],
    enabled,
    refetchOnMount: "always",
    // Keep the prior chart on screen while a new range/view refetches, so the
    // section never collapses to the skeleton and the scroll position holds
    // (r27 item 1: changing range no longer jumps the page up).
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const qs = new URLSearchParams({ from, to, view });
      if (net) qs.set("net", "1");
      const res = await clientApiFetch(
        `/budgets/${budgetId}/overview/wealth?${qs.toString()}`,
        { headers: { "X-Budget-ID": budgetId } },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as OverviewWealthDTO;
    },
  });
}
