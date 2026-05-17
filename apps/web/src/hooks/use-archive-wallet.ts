"use client";
/**
 * use-archive-wallet.ts — Optimistic POST /wallets/:id/archive mutation.
 *
 * Removes the wallet from the cache optimistically; rolls back on error.
 * D-PH5-E1: Cross-invalidates reserves when the archived wallet was RESERVE.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { toast } from "sonner";
import type { WalletDto } from "./use-wallets";

export function useArchiveWallet(budgetId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (walletId: string) => {
      const res = await clientApiFetch(`/wallets/${walletId}/archive`, {
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

    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["budget", budgetId, "wallets"], ctx.previous);
      }
      toast.error("bdp.tab.wallets.toast.archiveFailed");
    },

    onSuccess: () => toast.success("bdp.tab.wallets.toast.archived"),

    onSettled: (_data, _err, walletId, ctx) => {
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "wallets"] });
      const wasReserve =
        ctx?.previous?.find((w) => w.id === walletId)?.walletType === "RESERVE";
      if (wasReserve) {
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      }
    },
  });
}
