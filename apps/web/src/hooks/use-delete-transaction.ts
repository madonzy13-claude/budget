"use client";
/**
 * use-delete-transaction.ts — Mutation to delete a transaction.
 *
 * DELETE /budgets/:budgetId/transactions/:txId
 * On success: invalidates ["transactions", ...] + ["spendings-summary", ...]
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";

export function useDeleteTransaction(budgetId: string, month: string) {
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();

  return useMutation({
    mutationFn: async (txId: string) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/transactions/${txId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await res.text());
      return txId;
    },

    onMutate: async (txId) => {
      await qc.cancelQueries({ queryKey: ["transactions", budgetId, month] });
      const previous = qc.getQueryData(["transactions", budgetId, month]);

      qc.setQueryData(["transactions", budgetId, month], (old: unknown) => {
        const arr = Array.isArray(old) ? old : [];
        return arr.filter((t: Record<string, unknown>) => t.id !== txId);
      });

      return { previous };
    },

    onError: (err, _txId, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["transactions", budgetId, month], ctx.previous);
      }
      // Honest-offline: refused write shows the shared offline toast.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["transactions", budgetId, month] });
      // Cross-month reserve pool → refresh ALL months' summaries (partial key).
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId],
      });
      // Deleting a transaction repays the reserve pool (any month) and shifts
      // the RESERVE_TOPUP mismatch — refresh the reserves tab + pill badge live.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
    },
  });
}
