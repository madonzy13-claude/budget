"use client";
/**
 * use-edit-entry.ts — PATCH /investments/entries/:entryId (13.1 round 6,
 * user): a transaction's note and date. Amounts stay as booked; the server
 * keeps the date between the entry's neighbours (both legs of a pair move).
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

export function useEditEntry(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments");
  const offlineToast = useOfflineWriteToast();
  return useMutation({
    mutationFn: ({
      entryId,
      body,
    }: {
      entryId: string;
      body: { note?: string; effectiveDate?: string };
    }) =>
      assetWrite<{ ok: true }>(
        `/budgets/${budgetId}/investments/entries/${entryId}`,
        "PATCH",
        body,
      ),
    onSuccess: () => toast.success(t("ledger.edit.saved")),
    onError: (e) => {
      if (isOfflineWriteError(e)) return offlineToast();
      toast.error(t(assetRefusalKey((e as AssetWriteError).code ?? "")));
    },
    onSettled: () =>
      invalidateInvestments(qc, budgetId, { walletTouched: false }),
  });
}
