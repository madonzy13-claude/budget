"use client";
/**
 * use-reorder-wallets.ts — Optimistic POST /wallets/reorder mutation.
 *
 * UAT-PH5-T3-1x. Drag-to-reorder within a section. The optimistic update
 * rearranges the cached array immediately; on error the previous order is
 * restored. Cross-section moves are still handled by useUpdateWallet
 * (PATCH walletType).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type { WalletDto } from "./use-wallets";

export interface ReorderWalletsInput {
  walletType: WalletDto["walletType"];
  orderedIds: string[];
}

export function useReorderWallets(budgetId: string) {
  const qc = useQueryClient();
  // UAT-PH5-T3-35: translate toast strings.
  const t = useTranslations("bdp.tab.wallets.toast");
  const offlineToast = useOfflineWriteToast();

  return useMutation({
    mutationFn: async (input: ReorderWalletsInput) => {
      const res = await clientApiWrite(`/wallets/reorder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": generateIdempotencyKey(),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "reorder_failed");
      }
      return (await res.json()) as { ok: true };
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["budget", budgetId, "wallets"] });
      const previous = qc.getQueryData<WalletDto[]>([
        "budget",
        budgetId,
        "wallets",
      ]);

      qc.setQueryData<WalletDto[]>(["budget", budgetId, "wallets"], (old) => {
        if (!old) return old;
        const orderMap = new Map(input.orderedIds.map((id, i) => [id, i + 1]));
        // Patch sortOrder on the rows touched by this reorder; rows in other
        // sections keep their existing position.
        const next = old.map((w) =>
          w.walletType === input.walletType && orderMap.has(w.id)
            ? { ...w, sortOrder: orderMap.get(w.id)! }
            : w,
        );
        // Re-sort to reflect the new order in the array shape too — list
        // consumers may rely on array order, not sortOrder values.
        next.sort((a, b) => {
          if (a.walletType !== b.walletType) {
            return a.walletType.localeCompare(b.walletType);
          }
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        });
        return next;
      });

      return { previous };
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
      toast.error(t("reorderFailed"));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "wallets"] });
    },
  });
}
