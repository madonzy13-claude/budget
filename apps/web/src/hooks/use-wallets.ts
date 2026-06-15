"use client";
/**
 * use-wallets.ts — Query hook for the wallet list.
 *
 * Query key: ["budget", budgetId, "wallets"]
 * Supports initialData from the RSC page for instant render.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { getCachedEntities, markSynced } from "@/lib/offline-cache";

export interface WalletDto {
  id: string;
  name: string;
  walletType: "SPENDINGS" | "CUSHION" | "RESERVE";
  currency: string;
  currentBalanceCents: string;
  /**
   * UAT-PH5-T3-46: server-converted balance expressed in the budget's
   * default currency (via FxProvider). Used by Share % math to compare
   * mixed-currency wallets on a single scale. Same units as
   * currentBalanceCents (integer-cents string). Falls back to
   * currentBalanceCents on the consumer side when missing.
   */
  currentBalanceInBudgetCurrencyCents?: string;
  archivedAt: string | null;
  // UAT-PH5-T3-1x: presentation-only customization + intra-section pos.
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export function useWallets(budgetId: string, initialData?: WalletDto[]) {
  return useQuery({
    queryKey: ["budget", budgetId, "wallets"],
    queryFn: async () => {
      // OFFLINE FAST-PATH (260615-e8s round 7): navigator.onLine===false is
      // reliable on iOS. Go straight to the cache — a real offline fetch HANGS
      // (does not reject) on the device, which left the query stuck on a
      // skeleton forever. Serve cache, or fail fast if there is none.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const cached = await getCachedEntities("wallets");
        if (cached.length) return cached as WalletDto[];
        throw new Error("offline_no_cache");
      }
      try {
        // Timeout so an online-but-actually-dead link (iOS reports onLine=true)
        // rejects in 7s instead of hanging, then falls back to cache.
        const res = await clientApiFetch(`/wallets`, {
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        void markSynced(budgetId).catch(() => {});
        return (json.wallets ?? []) as WalletDto[];
      } catch (e) {
        // Offline read-back: serve cached rows. WalletDto has no budgetId field —
        // cached rows are per-browser per-tenant data (wiped on logout), so
        // serving all cached wallets is acceptable read-only offline fallback.
        const cached = await getCachedEntities("wallets");
        if (cached.length) return cached as WalletDto[];
        throw e;
      }
    },
    initialData,
    // Always refetch on mount so the cache-age stamp (markSynced, in the queryFn)
    // fires on every online visit — otherwise initialData + the global 30s
    // staleTime skips the refetch and "data updated X ago" never moves
    // (260615-e8s round 7). initialData still renders instantly; this is a
    // background refetch, and offline it fast-fails to the cache (no stamp).
    refetchOnMount: "always",
  });
}
