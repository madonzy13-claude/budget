"use client";
/**
 * use-delete-transaction.ts — Mutation to delete a transaction.
 *
 * DELETE /budgets/:budgetId/transactions/:txId
 * On success: invalidates ["transactions", ...] + ["spendings-summary", ...]
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export function useDeleteTransaction(budgetId: string, month: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (txId: string) => {
      const res = await clientApiFetch(
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

    onError: (_err, _txId, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["transactions", budgetId, month], ctx.previous);
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["transactions", budgetId, month] });
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId, month],
      });
    },
  });
}
