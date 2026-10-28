"use client";
/**
 * use-sell-holding.ts — POST /investments/:id/sell (Phase 13 → 13.1 Swap → Sell).
 *
 * One request, one server transaction. No optimistic rewrite: a sale touches
 * the source, maybe a destination asset or a wallet, realized and history, so
 * the lists are refetched. A sale into a wallet (D-20) also refreshes the
 * wallet family. Honest-offline via clientApiWrite (no queue).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import {
  AssetWriteError,
  assetWrite,
  invalidateInvestments,
} from "@/lib/investment-invalidate";

export type WalletTarget =
  | { kind: "existing"; walletId: string }
  | { kind: "new"; name: string; walletType: string; currency: string }
  | { kind: "nowhere" };

export interface SellHoldingBody {
  effectiveDate: string;
  left: { quantity: string } | { valueCents: string };
  destination:
    | { kind: "new"; holding: Record<string, unknown>; priceCents?: string }
    | { kind: "existing"; holdingId: string; quantityBought?: string }
    | { kind: "out"; wallet?: WalletTarget };
  /** Out / amount destinations; a quantity destination is qty × price. */
  receivedCents?: string;
  receivedCurrency: string;
}

/** Kept for the Phase 13 sheet; same class as every 13.1 write refusal. */
export { AssetWriteError as SellError };

export function useSellHolding(budgetId: string) {
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();
  return useMutation({
    mutationFn: ({
      holdingId,
      body,
    }: {
      holdingId: string;
      body: SellHoldingBody;
    }) =>
      assetWrite<{
        transferId: string | null;
        newHoldingId: string | null;
        walletId: string | null;
      }>(`/budgets/${budgetId}/investments/${holdingId}/sell`, "POST", body),
    onError: (e) => {
      if (isOfflineWriteError(e)) offlineToast();
    },
    onSettled: (data) =>
      invalidateInvestments(qc, budgetId, {
        walletTouched: (data?.walletId ?? null) !== null,
      }),
  });
}
