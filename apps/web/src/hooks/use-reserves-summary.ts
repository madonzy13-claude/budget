"use client";
/**
 * use-reserves-summary.ts — TanStack Query hook for GET /budgets/:id/reserves.
 *
 * W-3 contract: response carries BOTH active rows (rows) AND excluded rows
 * (excludedRows) — the client never issues a separate /categories fetch.
 * Excluded rows carry FROZEN REAL balances from the server; never synthesized as zero.
 *
 * queryKey: ["budget", budgetId, "reserves"]
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface ReservesSummaryRow {
  categoryId: string;
  name: string;
  reserveBalanceCents: string;
  walletSharePercent: number | null;
  walletShareAmountCents: string | null;
}

export interface ReservesSummaryDto {
  /** Active rows — participate in totals + wallet share math */
  rows: ReservesSummaryRow[];
  /** Excluded rows (W-3) — FROZEN REAL balances from server; share fields always null */
  excludedRows: ReservesSummaryRow[];
  totals: {
    totalCategoryReservesCents: string;
    totalReserveWalletAmountCents: string;
    mismatchCents: string;
    disabled: boolean;
    budgetCurrency: string;
  };
}

export function useReservesSummary(
  budgetId: string,
  initialData?: ReservesSummaryDto,
) {
  return useQuery({
    queryKey: ["budget", budgetId, "reserves"],
    queryFn: async () => {
      const res = await clientApiFetch(`/budgets/${budgetId}/reserves`);
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as ReservesSummaryDto;
    },
    initialData,
  });
}
