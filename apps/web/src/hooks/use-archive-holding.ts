"use client";
/**
 * use-archive-holding.ts — Optimistic POST /investments/:id/archive (Phase 9).
 *
 * Soft-archive (no restore here, D-03). Removes the row from the cache
 * optimistically; rolls back on error. clientApiWrite → honest-offline.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { toast } from "sonner";
import type { InvestmentsPayload } from "./use-investments";

export function useArchiveHolding(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments.toast");
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
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    },

    onMutate: async (holdingId) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<InvestmentsPayload>(key);
      qc.setQueryData<InvestmentsPayload>(key, (old) =>
        old?.holdings
          ? { ...old, holdings: old.holdings.filter((h) => h.id !== holdingId) }
          : old,
      );
      return { previous };
    },

    onError: (err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("archiveFailed"));
    },

    onSuccess: () => toast.success(t("archived")),

    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
