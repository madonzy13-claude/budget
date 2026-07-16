"use client";
/**
 * use-spendings-summary.ts — TanStack Query hook for per-category spending summary.
 *
 * queryKey: ["spendings-summary", budgetId, month]
 * Hydrated from RSC initialData (Plan 04-04 spendings/page.tsx).
 * Pattern: task-banner.tsx useQuery + initialData.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface SpendingsSummaryDTO {
  budgetId: string;
  month: string;
  budgetTz: string;
  /** Budget default currency — server-supplied on the summary response. */
  budgetCurrency: string;
  cushionModeEnabled: boolean;
  /** r40: newest created_at over confirmed, non-deleted spendings (ISO) —
   *  budget-wide; null when the budget has no confirmed spendings. */
  lastSpendingAddedAt: string | null;
  categories: Array<{
    categoryId: string;
    name: string;
    iconKey: string | null;
    colorKey: string | null;
    sortIndex: number;
    plannedCents: string;
    cushionCents: string;
    /** mig 0061: persisted needs/wants split (null/absent = never set). */
    needsCents?: string | null;
    wantsCents?: string | null;
    activeBudgetCents: string;
    spentCents: string;
    reserveUsedCents: string;
    reserveAvailableCents: string;
    reserveExcluded?: boolean;
    /** Archived "keep history" — column rendered greyed + read-only. */
    archived?: boolean;
    overspentCents: string;
    balanceCents: string;
    /** r33: THE Investments category — green overinvested row + smart/manual edit. */
    isInvestment?: boolean;
    investmentLimitMode?: string | null;
  }>;
}

/**
 * Bare fetch for the per-month spendings summary. Shared by the hook's queryFn
 * AND by the grid's past-month background prefetch (Task 2, month preload), so
 * a prefetched month is consumable by useSpendingsSummary verbatim.
 */
export async function fetchSpendingsSummary(
  budgetId: string,
  month: string,
): Promise<SpendingsSummaryDTO> {
  const res = await clientApiFetch(
    `/budgets/${budgetId}/spendings-summary?month=${month}`,
  );
  if (!res.ok) throw new Error("spendings_summary_fetch_failed");
  return await res.json();
}

export function useSpendingsSummary(
  budgetId: string,
  month: string,
  initialData?: SpendingsSummaryDTO,
) {
  return useQuery({
    queryKey: ["spendings-summary", budgetId, month] as const,
    initialData,
    queryFn: () => fetchSpendingsSummary(budgetId, month),
    // 260625: cache-first + ALWAYS background-revalidate. The BDP carousel does
    // not remount the grid on in-tab month nav (a queryKey switch, for which RQ
    // consults staleTime, not refetchOnMount), and a cross-month mutation (cushion
    // toggle, limit effective-from a prior month) recomputes PAST months. With the
    // restore-gate (QueryProvider IsRestoringProvider) hydrate lands before any
    // fetch, so staleTime:0 + refetchOnMount:"always" deterministically fires a
    // background refetch that replaces the cached rows the instant the fetch lands
    // — cache-first paint via keepPreviousData, no skeleton, never stale.
    staleTime: 0,
    refetchOnMount: "always",
    // SPA/SWR (260616): warm cache renders instantly; this background refetch
    // replaces it if the month's data changed (matches use-transactions).
    // 260618: keep the PREVIOUS month's summary on screen while the new month's
    // loads. Without it, a month change flipped the key → isPending → the grid
    // swapped to skeletons mid-slide, so the directional month-slide played on
    // the skeletons and the real columns just popped in ("no animation"). With
    // keepPreviousData the columns persist and the SLIDE plays on them.
    placeholderData: keepPreviousData,
  });
}
