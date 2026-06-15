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
      // OFFLINE FAST-PATH (260615-e8s round 7): see use-wallets — avoid the
      // hanging-fetch skeleton by serving cache directly when offline.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const cached = await getCachedTransactions(budgetId, month);
        if (cached.length) return cached as TxnDTO[];
        throw new Error("offline_no_cache");
      }
      try {
        const res = await clientApiFetch(
          `/budgets/${budgetId}/transactions?month=${month}&confirmed=true`,
          { signal: AbortSignal.timeout(7000) },
        );
        if (!res.ok) throw new Error("transactions_fetch_failed");
        const body = (await res.json()) as { transactions?: TxnRowSnake[] };
        void markSynced(budgetId).catch(() => {});
        return (body.transactions ?? []).map(mapTxnRowToDTO);
      } catch (e) {
        const cached = await getCachedTransactions(budgetId, month);
        if (cached.length) return cached as TxnDTO[];
        throw e;
      }
    },
    staleTime: 30_000,
    // Refetch on mount so markSynced stamps the cache age on each online visit
    // (260615-e8s round 7). initialData renders instantly; background refetch.
    refetchOnMount: "always",
  });
}
