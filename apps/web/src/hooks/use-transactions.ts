"use client";
/**
 * use-transactions.ts — TanStack Query hook for confirmed transactions.
 *
 * queryKey: ["transactions", budgetId, month]
 * This exact key is used by all mutation hooks (create, update, delete, confirm-draft)
 * to invalidate and update the cache. Verbatim string match is REQUIRED.
 *
 * Hydrated from RSC initialData (Plan 04-04 spendings/page.tsx).
 * queryFn: GET /budgets/:budgetId/transactions?month=YYYY-MM&confirmed=true
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import {
  mapTxnRowToDTO,
  type TxnDTO,
  type TxnRowSnake,
} from "@/lib/txn-mapper";
import { getCachedTransactions, markSynced } from "@/lib/offline-cache";

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
      try {
        const res = await clientApiFetch(
          `/budgets/${budgetId}/transactions?month=${month}&confirmed=true`,
        );
        if (!res.ok) throw new Error("transactions_fetch_failed");
        const body = (await res.json()) as { transactions?: TxnRowSnake[] };
        // Real network success → stamp the cache age (260615-e8s round 5).
        void markSynced(budgetId).catch(() => {});
        return (body.transactions ?? []).map(mapTxnRowToDTO);
      } catch (e) {
        // Offline read-back (260615-e8s): serve cached transactions filtered
        // by budgetId+month so the spendings grid paints last-online rows.
        // _cacheKey is kept on cached rows; TxnDTO consumers ignore extra fields.
        const cached = await getCachedTransactions(budgetId, month);
        if (cached.length) return cached as TxnDTO[];
        throw e;
      }
    },
    staleTime: 30_000,
  });
}
