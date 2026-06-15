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
      try {
        const res = await clientApiFetch(`/wallets`);
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        // Real network success → stamp the cache age (260615-e8s round 5).
        void markSynced(budgetId).catch(() => {});
        return (json.wallets ?? []) as WalletDto[];
      } catch (e) {
        // Offline read-back (260615-e8s): serve cached rows so a cold offline
        // reload paints the last-online wallet list instead of a blank shell.
        // Note: WalletDto has no budgetId field — cached rows are per-browser
        // per-tenant data (wiped on logout via wipeBudgetCache), so serving
        // all cached wallets is safe for single-budget users; multi-budget users
        // see all their wallets combined (acceptable read-only offline fallback).
        const cached = await getCachedEntities("wallets");
        if (cached.length) return cached as WalletDto[];
        throw e;
      }
    },
    initialData,
  });
}
