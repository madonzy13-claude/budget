"use client";
/**
 * use-overview-overspent.ts — lazy RQ hook for
 * GET /budgets/:id/overview/overspent-reserves (Phase 11, 11-05 endpoint).
 * Range-scoped overspent + (non-range) reserves-by-category. Fetches only when the
 * section is open (`enabled`); range is part of the query key (D-03).
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface OverviewOverspentDTO {
  currency: string;
  overspent_total_cents: string;
  overspent_by_category: {
    category_id: string;
    name: string;
    overspent_cents: string;
  }[];
  reserves_by_category: {
    category_id: string;
    name: string;
    reserve_cents: string;
  }[];
}

export function useOverviewOverspent(
  budgetId: string,
  opts: { from: string; to: string; enabled: boolean },
) {
  const { from, to, enabled } = opts;
  return useQuery({
    queryKey: ["budget", budgetId, "overview", "overspent", from, to],
    enabled,
    // Hold the prior charts while a new range refetches (r27 item 1: no scroll jump).
    placeholderData: keepPreviousData,
    // Cache-first paint on (re)mount + background revalidate (symmetric with the
    // cards hook): a reserve edited in the Reserves tab must show fresh here when
    // the user returns to Overview, not stale-until-reload (UAT round 8 item 7).
    refetchOnMount: "always",
    queryFn: async () => {
      const qs = new URLSearchParams({ from, to });
      const res = await clientApiFetch(
        `/budgets/${budgetId}/overview/overspent-reserves?${qs.toString()}`,
        { headers: { "X-Budget-ID": budgetId } },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as OverviewOverspentDTO;
    },
  });
}
