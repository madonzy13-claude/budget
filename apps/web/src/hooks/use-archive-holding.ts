"use client";
/**
 * use-archive-holding.ts — POST /investments/:id/archive (13.1 round 4: archive
 * is an explicit row action; a sold-out asset no longer hides itself).
 *
 * Removes the asset from the list optimistically; rolls back on error. Buying,
 * selling or moving into it later brings it back (server revive paths).
 */
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { invalidateInvestments } from "@/lib/investment-invalidate";
import type { HoldingDto } from "./use-investments";

/** Move one asset between the visible and the hidden lists in one step;
 *  returns how to undo it. */
async function moveBetween(
  qc: QueryClient,
  budgetId: string,
  holdingId: string,
  to: "hide" | "show",
) {
  const visible = ["budget", budgetId, "investments"] as const;
  const hidden = ["budget", budgetId, "investments", "hidden"] as const;
  await qc.cancelQueries({ queryKey: visible, exact: true });
  await qc.cancelQueries({ queryKey: hidden, exact: true });
  const prevVisible = qc.getQueryData<HoldingDto[]>(visible);
  const prevHidden = qc.getQueryData<HoldingDto[]>(hidden);
  const [from, into] = to === "hide" ? [visible, hidden] : [hidden, visible];
  const moving = qc
    .getQueryData<HoldingDto[]>(from)
    ?.find((h) => h.id === holdingId);
  qc.setQueryData<HoldingDto[]>(
    from,
    (old) => old?.filter((h) => h.id !== holdingId) ?? [],
  );
  if (moving)
    qc.setQueryData<HoldingDto[]>(into, (old) => [...(old ?? []), moving]);
  return {
    rollback: () => {
      qc.setQueryData(visible, prevVisible);
      qc.setQueryData(hidden, prevHidden);
    },
  };
}

export function useArchiveHolding(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments");
  const offlineToast = useOfflineWriteToast();
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
    // R6 (user): hidden assets still count in every total, so the asset moves
    // to the hidden list in the SAME step it leaves the visible one — the
    // totals never dip while the server answers.
    onMutate: (holdingId) => moveBetween(qc, budgetId, holdingId, "hide"),
    onError: (err, _id, ctx) => {
      ctx?.rollback();
      if (isOfflineWriteError(err)) return offlineToast();
      toast.error(t("asset.archive.failed"));
    },
    onSuccess: () => toast.success(t("asset.archive.done")),
    onSettled: () =>
      invalidateInvestments(qc, budgetId, { walletTouched: false }),
  });
}

/** Round 5: picking an archived asset brings it back (POST /:id/restore). */
export function useRestoreHolding(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments");
  const offlineToast = useOfflineWriteToast();
  return useMutation({
    mutationFn: async (holdingId: string) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/investments/${holdingId}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { ok: true };
    },
    onMutate: (holdingId) => moveBetween(qc, budgetId, holdingId, "show"),
    onError: (err, _id, ctx) => {
      ctx?.rollback();
      if (isOfflineWriteError(err)) return offlineToast();
      toast.error(t("swap.err.saveFailed"));
    },
    onSettled: () =>
      invalidateInvestments(qc, budgetId, { walletTouched: false }),
  });
}
