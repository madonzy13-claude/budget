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
 * link.
 *
 * 260625: refetchOnMount:"always" RE-ADDED (it had been removed as a suspected
 * nav-lag cause). Without it, a full page RELOAD restored the IDB-persisted
 * transactions list and — because it was younger than staleTime:30s — treated it
 * as FRESH and skipped revalidation, so a transaction edited/added just before
 * the reload showed its OLD amount until the 30s window lapsed (the reserves-
 * golden "edit 100→200 persisted on the server but the reloaded grid still shows
 * 100" bug: a stale list after reload). The original nav-lag no longer applies:
 * (1) keepPreviousData (added later, below) keeps the prior data visible during
 * the forced background refetch — no skeleton flash; (2) the BDP carousel keeps
 * the grid MOUNTED across in-tab month nav (a queryKey switch, not a remount), so
 * refetchOnMount fires only on a real page/tab mount, never on month nav. Net:
 * cache-first paint, always background-revalidated on mount — never stale after a
 * reload. staleTime:30s still gates non-mount (interval/focus) revalidation.
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
    // 260625: force a background revalidate on every mount so a reload never
    // serves a stale just-restored list (see file header). keepPreviousData keeps
    // the cached rows on screen meanwhile, so there is no skeleton flash.
    refetchOnMount: "always",
    // 260618: keep previous month's transactions visible during a month change
    // so the grid columns persist (no skeleton flash) and the month-slide
    // animation plays on the real columns. See use-spendings-summary.
    placeholderData: keepPreviousData,
  });
}
