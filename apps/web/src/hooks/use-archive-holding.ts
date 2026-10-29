"use client";
/**
 * use-archive-holding.ts — POST /investments/:id/archive (13.1 round 4: archive
 * is an explicit row action; a sold-out asset no longer hides itself).
 *
 * Removes the asset from the list optimistically; rolls back on error. Buying,
 * selling or moving into it later brings it back (server revive paths).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { invalidateInvestments } from "@/lib/investment-invalidate";
import type { HoldingDto } from "./use-investments";

export function useArchiveHolding(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments");
  const offlineToast = useOfflineWriteToast();
  const key = ["budget", budgetId, "investments"] as const;

  return useMutation({
    mutationFn: async (holdingId: string) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/investments/${holdingId}/archive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { ok: true };
    },
    onMutate: async (holdingId) => {
      await qc.cancelQueries({ queryKey: key, exact: true });
      const previous = qc.getQueryData<HoldingDto[]>(key);
      qc.setQueryData<HoldingDto[]>(
        key,
        (old) => old?.filter((h) => h.id !== holdingId) ?? [],
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      if (isOfflineWriteError(err)) return offlineToast();
      toast.error(t("asset.archive.failed"));
    },
    onSuccess: () => toast.success(t("asset.archive.done")),
    onSettled: () => invalidateInvestments(qc, budgetId, { walletTouched: false }),
  });
}
