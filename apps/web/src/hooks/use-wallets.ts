"use client";
/**
 * use-wallets.ts — Query hook for the wallet list.
 *
 * Query key: ["budget", budgetId, "wallets"]
 * Supports initialData for instant render.
 *
 * SPA/SWR (260616): plain client fetch — offline is handled by React Query
 * networkMode + the persisted query cache (query-persist.ts). The old bespoke
 * IndexedDB read-back + setCachedEntities/markSynced sync-meta were removed;
 * AbortSignal.timeout still fails fast on an iOS lying-online dead link, and
 * refetchOnMount:"always" keeps a warm cache revalidating.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

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
      const res = await clientApiFetch(`/wallets`, {
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return (json.wallets ?? []) as WalletDto[];
    },
    initialData,
  });
}
