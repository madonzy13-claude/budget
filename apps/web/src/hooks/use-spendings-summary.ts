"use client";
/**
 * use-spendings-summary.ts — TanStack Query hook for per-category spending summary.
 *
 * queryKey: ["spendings-summary", budgetId, month]
 * Hydrated from RSC initialData (Plan 04-04 spendings/page.tsx).
 * Pattern: task-banner.tsx useQuery + initialData.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface SpendingsSummaryDTO {
  budgetId: string;
  month: string;
  budgetTz: string;
  cushionModeEnabled: boolean;
  categories: Array<{
    categoryId: string;
    name: string;
    iconKey: string | null;
    colorKey: string | null;
    sortIndex: number;
    plannedCents: string;
    cushionCents: string;
    activeBudgetCents: string;
    spentCents: string;
    reserveUsedCents: string;
    reserveAvailableCents: string;
    reserveExcluded?: boolean;
    /** Archived "keep history" — column rendered greyed + read-only. */
    archived?: boolean;
    overspentCents: string;
    balanceCents: string;
  }>;
}

export function useSpendingsSummary(
  budgetId: string,
  month: string,
  initialData?: SpendingsSummaryDTO,
) {
  return useQuery({
    queryKey: ["spendings-summary", budgetId, month] as const,
    initialData,
    queryFn: async (): Promise<SpendingsSummaryDTO> => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/spendings-summary?month=${month}`,
      );
      if (!res.ok) throw new Error("spendings_summary_fetch_failed");
      return await res.json();
    },
    staleTime: 30_000,
  });
}
