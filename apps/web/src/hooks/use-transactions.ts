"use client";
/**
 * use-transactions.ts — TanStack Query hook for confirmed transactions.
 *
 * queryKey: ["transactions", budgetId, month]
 * This exact key is used by all mutation hooks (create, update, delete, confirm-draft)
 * to invalidate and update the cache. Verbatim string match is REQUIRED.
 *
 * queryFn: GET /budgets/:budgetId/transactions?month=YYYY-MM&confirmed=true
 *
 * SPA/SWR (260616): plain client fetch — offline is handled by React Query
 * networkMode (paused offline → keeps cached data) + the persisted query cache
 * (query-persist.ts). The old bespoke IndexedDB read-back + markSynced sync-meta
 * were removed; AbortSignal.timeout still fails fast on an iOS lying-online dead
 * link. staleTime:30s gives stale-while-revalidate WITHOUT a refetch on every
 * mount/tab-switch (refetchOnMount:"always" was removed — it was the nav-lag
 * cause); a warm cache revalidates only once the 30s window lapses.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import {
  mapTxnRowToDTO,
  type TxnDTO,
  type TxnRowSnake,
} from "@/lib/txn-mapper";

export { mapTxnRowToDTO };
export type { TxnDTO, TxnRowSnake };

export function useTransactions(
  budgetId: string,
  month: string,
  options?: { initialData?: TxnDTO[] },
) {
  return useQuery({
    queryKey: ["transactions", budgetId, month] as const,
    initialData: options?.initialData,
    queryFn: async (): Promise<TxnDTO[]> => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/transactions?month=${month}&confirmed=true`,
        { signal: AbortSignal.timeout(7000) },
      );
      if (!res.ok) throw new Error("transactions_fetch_failed");
      const body = (await res.json()) as { transactions?: TxnRowSnake[] };
      return (body.transactions ?? []).map(mapTxnRowToDTO);
    },
    staleTime: 30_000,
    // 260618: keep previous month's transactions visible during a month change
    // so the grid columns persist (no skeleton flash) and the month-slide
    // animation plays on the real columns. See use-spendings-summary.
    placeholderData: keepPreviousData,
  });
}
