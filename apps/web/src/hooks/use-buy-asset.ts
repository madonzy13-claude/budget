"use client";
/**
 * use-buy-asset.ts — POST /investments/:id/buy (Phase 13.1 Swap → Buy, D-08).
 * Errors come back as AssetWriteError for the sheet to show inline; offline is
 * the shared refusal toast.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { assetWrite, invalidateInvestments } from "@/lib/investment-invalidate";

export type BuyAssetBody =
  | {
      kind: "quantity";
      quantity: string;
      priceCents: string;
      currency: string;
      effectiveDate: string;
    }
  | {
      kind: "amount";
      amountCents: string;
      currency: string;
      effectiveDate: string;
    }
  | {
      kind: "broker";
      amountCents: string;
      valueAfterCents: string;
      effectiveDate: string;
    };

export function useBuyAsset(budgetId: string) {
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();
  return useMutation({
    mutationFn: ({
      holdingId,
      body,
    }: {
      holdingId: string;
      body: BuyAssetBody;
    }) =>
      assetWrite<{ entryId: string }>(
        `/budgets/${budgetId}/investments/${holdingId}/buy`,
        "POST",
        body,
      ),
    onError: (e) => {
      if (isOfflineWriteError(e)) offlineToast();
    },
    onSettled: () =>
      invalidateInvestments(qc, budgetId, { walletTouched: false }),
  });
}
