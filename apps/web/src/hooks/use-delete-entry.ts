"use client";
/**
 * use-delete-entry.ts — DELETE /investments/entries/:entryId (Phase 13.1).
 *
 * Only the newest entry is deletable (D-14); the server re-checks under a lock
 * and answers 409 when the ledger moved, which shows "asset changed". Deleting
 * a sale paid into a wallet takes the amount back out (D-21), so the wallet
 * family refreshes too.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import {
  AssetWriteError,
  assetRefusalKey,
  assetWrite,
  invalidateInvestments,
} from "@/lib/investment-invalidate";

export function useDeleteEntry(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments");
  const offlineToast = useOfflineWriteToast();
  return useMutation({
    mutationFn: ({ entryId }: { entryId: string }) =>
      assetWrite<{ wipedHoldingId: string | null; walletId: string | null }>(
        `/budgets/${budgetId}/investments/entries/${entryId}`,
        "DELETE",
      ),
    onSuccess: () => toast.success(t("ledger.deleted")),
    onError: (e) => {
      if (isOfflineWriteError(e)) return offlineToast();
      toast.error(t(assetRefusalKey((e as AssetWriteError).code ?? "")));
    },
    onSettled: (data) =>
      // Error path: the delete may still have touched a wallet — refresh all.
      invalidateInvestments(qc, budgetId, {
        walletTouched: data ? data.walletId !== null : true,
      }),
  });
}
