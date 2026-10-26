"use client";
/**
 * use-holding-history.ts — Phase 13 History (D-05/D-06).
 *
 * useHoldingHistory: a holding's dated entries, newest first.
 * useDeleteHistoryEntry: DELETE /history/:id = full undo on the server (both
 * legs of a conversion). No optimistic rewrite — the undo changes holdings,
 * realized and contributions, so everything under the investments prefix is
 * refetched (this AND the counterparty's history, type summary, holdings).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clientApiFetch } from "@/lib/budget-fetch";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";

export interface HistoryEntryDto {
  id: string;
  kind:
    | "start"
    | "buy"
    | "add"
    | "value_change"
    | "withdraw"
    | "convert_out"
    | "convert_in";
  effectiveDate: string;
  amountCents: string | null;
  amountCurrency: string | null;
  qtyDelta: string | null;
  realizedBudgetCents: string | null;
  budgetCurrency: string | null;
  transferId: string | null;
  counterpartyName: string | null;
  createdAt: string;
}

export const historyKey = (budgetId: string, holdingId: string) =>
  ["budget", budgetId, "investments", "history", holdingId] as const;

export function useHoldingHistory(budgetId: string, holdingId: string) {
  return useQuery({
    queryKey: historyKey(budgetId, holdingId),
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investments/${holdingId}/history`,
        { signal: AbortSignal.timeout(7000) },
      );
      if (!res.ok) throw new Error(await res.text());
      return ((await res.json()) as { entries: HistoryEntryDto[] }).entries;
    },
  });
}

const REFUSALS: Record<string, string> = {
  undo_later_first: "errUndoLaterFirst",
  would_empty_holding: "errWouldEmpty",
  would_go_negative: "errWouldEmpty",
};

export function useDeleteHistoryEntry(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments");
  const offlineToast = useOfflineWriteToast();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/investments/history/${entryId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "undo_failed");
      }
      return (await res.json()) as { undone: number };
    },
    onSuccess: () => toast.success(t("history.toastDeleted")),
    onError: (e) => {
      if (isOfflineWriteError(e)) return offlineToast();
      const key = REFUSALS[(e as Error).message];
      toast.error(t(key ? `history.${key}` : "sell.errSave"));
    },
    onSettled: () => {
      void qc.invalidateQueries({
        queryKey: ["budget", budgetId, "investments"],
      });
      void qc.invalidateQueries({ queryKey: ["budget", budgetId, "overview"] });
    },
  });
}
