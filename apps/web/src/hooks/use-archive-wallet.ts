"use client";
/**
 * use-archive-wallet.ts — Optimistic POST /wallets/:id/archive mutation.
 *
 * Removes the wallet from the cache optimistically; rolls back on error.
 * D-PH5-E1: Cross-invalidates reserves when the archived wallet was RESERVE.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { toast } from "sonner";
import type { WalletDto } from "./use-wallets";

export function useArchiveWallet(budgetId: string) {
  const qc = useQueryClient();
  // UAT-PH5-T3-35: translate toast strings instead of leaking the raw
  // i18n key into the UI. Same pattern as other wallet hooks.
  const t = useTranslations("bdp.tab.wallets.toast");
  const offlineToast = useOfflineWriteToast();

  return useMutation({
    mutationFn: async (walletId: string) => {
      const res = await clientApiWrite(`/wallets/${walletId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    },

    onMutate: async (walletId) => {
      await qc.cancelQueries({ queryKey: ["budget", budgetId, "wallets"] });
      const previous = qc.getQueryData<WalletDto[]>([
        "budget",
        budgetId,
        "wallets",
      ]);
      qc.setQueryData<WalletDto[]>(
        ["budget", budgetId, "wallets"],
        (old) => old?.filter((w) => w.id !== walletId) ?? [],
      );
      return { previous, walletId };
    },

    onError: (err, _input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["budget", budgetId, "wallets"], ctx.previous);
      }
      // Honest-offline: an offline/unreachable/hung write shows the shared toast.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("archiveFailed"));
    },

    onSuccess: () => toast.success(t("archived")),

    onSettled: (_data, _err, walletId, ctx) => {
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "wallets"] });
      const wasReserve =
        ctx?.previous?.find((w) => w.id === walletId)?.walletType === "RESERVE";
      if (wasReserve) {
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      }
      // Tasks redesign: backend archive-wallet fires recomputeCushionTask.
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
      // UAT round 6: archiving a cushion wallet changes the actual cushion
      // sum — refresh the Settings preview.
      qc.invalidateQueries({ queryKey: ["cushion-summary", budgetId] });
    },
  });
}
