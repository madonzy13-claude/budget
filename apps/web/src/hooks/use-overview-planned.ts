"use client";
/**
 * use-overview-planned.ts — lazy RQ hook for GET /budgets/:id/overview/planned
 * (Phase 11, 11-04 endpoint). Range-scoped (from/to) + optional categoryId; only
 * fetches when its section is open (`enabled`). The range/category are part of the
 * query key so RQ caches per selection (D-03). Cents stay strings; the component
 * converts to Number for recharts.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface OverviewPlannedDTO {
  currency: string;
  bucket: "monthly" | "daily";
  timeline: {
    label: string;
    planned_cents: string;
    real_cents: string;
    needs_cents: string;
    wants_cents: string;
  }[];
  plannedAvgVsReal: {
    category_id: string;
    name: string;
    planned_avg_cents: string;
    real_avg_cents: string;
  }[];
  recurringPerMonth: {
    month: number;
    planned_cents: string;
    items: { name: string; amount_cents: string }[];
  }[];
  recurringPerCategory: {
    category_id: string;
    name: string;
    planned_cents: string;
  }[];
}

export function useOverviewPlanned(
  budgetId: string,
  opts: { from: string; to: string; categoryId?: string; enabled: boolean },
) {
  const { from, to, categoryId, enabled } = opts;
  return useQuery({
    queryKey: [
      "budget",
      budgetId,
      "overview",
      "planned",
      from,
      to,
      categoryId ?? null,
    ],
    enabled,
    refetchOnMount: "always",
    // Hold the prior charts while a new range/category refetches (r27 item 1).
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const qs = new URLSearchParams({ from, to });
      if (categoryId) qs.set("categoryId", categoryId);
      const res = await clientApiFetch(
        `/budgets/${budgetId}/overview/planned?${qs.toString()}`,
        { headers: { "X-Budget-ID": budgetId } },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as OverviewPlannedDTO;
    },
  });
}
