"use client";
/**
 * use-transfer-asset.ts — POST /investments/:id/transfer (Phase 13.1, D-10).
 * Not a sale: flow 0, no wallet, so only the investments family refreshes.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { assetWrite, invalidateInvestments } from "@/lib/investment-invalidate";

export interface TransferAssetBody {
  effectiveDate: string;
  move: { quantity: string } | { valueCents: string };
  to: { kind: "existing"; holdingId: string } | { kind: "new"; name: string };
}

export function useTransferAsset(budgetId: string) {
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();
  return useMutation({
    mutationFn: ({
      holdingId,
      body,
    }: {
      holdingId: string;
      body: TransferAssetBody;
    }) =>
      assetWrite<{ transferId: string; newHoldingId: string | null }>(
        `/budgets/${budgetId}/investments/${holdingId}/transfer`,
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
