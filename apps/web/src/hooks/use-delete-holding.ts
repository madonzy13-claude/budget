"use client";
/**
 * use-delete-holding.ts — Optimistic DELETE /investments/:id (Phase 13).
 *
 * Erases the holding and its history; the server first undoes the conversions
 * it took part in (both sides). Removes the row from the cache optimistically;
 * rolls back on error. clientApiWrite → honest-offline.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { toast } from "sonner";
import type { HoldingDto } from "./use-investments";

export function useDeleteHolding(
  budgetId: string,
  // Possessions pass their own "removed" toast; defaults to the investment copy.
  opts?: { successMessage?: string },
) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments.toast");
  const offlineToast = useOfflineWriteToast();
  const key = ["budget", budgetId, "investments"] as const;

  return useMutation({
    mutationFn: async (holdingId: string) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/investments/${holdingId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    },

    onMutate: async (holdingId) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<HoldingDto[]>(key);
      qc.setQueryData<HoldingDto[]>(
        key,
        (old) => old?.filter((h) => h.id !== holdingId) ?? [],
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

    onSuccess: () => toast.success(opts?.successMessage ?? t("archived")),

    onSettled: () => {
      // Prefix match: holdings, type summary and histories (realized and
      // contributions change when conversions are undone).
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "overview"] });
    },
  });
}
