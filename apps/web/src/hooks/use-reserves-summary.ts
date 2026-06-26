"use client";
/**
 * use-reserves-summary.ts — TanStack Query hook for GET /budgets/:id/reserves.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md / 05-14 locked wire contract):
 * each category carries ONE engine-derived reserve (R) plus used (U) and
 * overspent. The budget-level totals carry internal (ΣR), userDefined
 * (Σ RESERVE-wallet balances), surplus (userDefined − internal) and a
 * direction the surplus banner renders (TOPUP / WITHDRAW / NONE). The OLD
 * expected/actual two-value, walletShare% and mismatch model is GONE.
 *
 * The response carries BOTH active rows (rows) AND excluded rows (excludedRows)
 * — the client never issues a separate /categories fetch.
 *
 * queryKey: ["budget", budgetId, "reserves"]
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface ReservesSummaryRow {
  categoryId: string;
  name: string;
  /** 260613-v1p: per-category color key (null = no color → no row accent bar). */
  colorKey: string | null;
  /** R — available reserve for this category (serialized cents). */
  reserveCents: string;
  /** U — reserve consumed by overspend (cumulative / ALL TIME, serialized cents). */
  usedCents: string;
  /** Reserve drawn in the open ('this') month only (serialized cents). */
  usedThisMonthCents: string;
  /** Σ per-month overspent for this category (serialized cents). */
  overspentCents: string;
}

export interface ReservesSummaryTotals {
  /** Σ R over active (non-excluded) categories (serialized cents). */
  internalCents: string;
  /** Σ RESERVE-wallet balances (serialized cents). */
  userDefinedCents: string;
  /** userDefined − internal (serialized cents; may be negative). */
  surplusCents: string;
  /** TOPUP when internal>userDefined, WITHDRAW when less, NONE at parity. */
  direction: "TOPUP" | "WITHDRAW" | "NONE";
  /** Σ used reserve over all non-excluded categories incl. archived (ALL TIME). */
  usedCents: string;
  /** Same, open month only (THIS MONTH). */
  usedThisMonthCents: string;
  disabled: boolean;
  budgetCurrency: string;
}

export interface ReservesSummaryDto {
  /** Active rows — participate in the internal/surplus totals. */
  rows: ReservesSummaryRow[];
  /** Excluded rows — name-only in the UI; reserve hidden. */
  excludedRows: ReservesSummaryRow[];
  totals: ReservesSummaryTotals;
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
    // 260625: cache-first + always background-revalidate, symmetric with
    // useSpendingsSummary. The BDP carousel reuses the warm cache on tab switch;
    // a cushion toggle / reserve adjust recomputes reserve availability
    // server-side, so the cached value can be stale. The restore-gate
    // (QueryProvider IsRestoringProvider) guarantees the persisted snapshot is
    // hydrated BEFORE this mount fetch fires, so the fetch always lands last and
    // replaces the snapshot — cache-first instant paint, fresh value when it
    // lands. (No staleTime:0: the reserve-adjust mutation writes optimistically +
    // invalidates on settle; an extra every-render staleness isn't needed and
    // refetchOnMount alone is the SWR contract without fighting the optimistic
    // write.)
    refetchOnMount: "always",
  });
}
