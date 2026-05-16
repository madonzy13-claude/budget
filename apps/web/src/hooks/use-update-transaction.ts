"use client";
/**
 * use-update-transaction.ts — Mutation to patch an existing transaction.
 *
 * PATCH /budgets/:budgetId/transactions/:txId
 * On success: invalidates ["transactions", ...] + ["spendings-summary", ...]
 * D-PH4-INT3: inline-edit scope = amount only; other fields via slider.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { mapTxnRowToDTO } from "@/lib/txn-mapper";

export interface UpdateTransactionInput {
  txId: string;
  amountCents?: number;
  note?: string | null;
  date?: string;
}

export function useUpdateTransaction(budgetId: string, month: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTransactionInput) => {
      const { txId, amountCents, note, date } = input;
      const body: Record<string, unknown> = {};
      if (amountCents !== undefined) body.amount_original_cents = amountCents;
      if (note !== undefined) body.note = note;
      if (date !== undefined) body.date = date;

      const res = await clientApiFetch(
        `/budgets/${budgetId}/transactions/${txId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": generateIdempotencyKey(),
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()).transaction;
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["transactions", budgetId, month] });
      const previous = qc.getQueryData(["transactions", budgetId, month]);

      qc.setQueryData(["transactions", budgetId, month], (old: unknown) => {
        const arr = Array.isArray(old) ? old : [];
        return arr.map((t: Record<string, unknown>) =>
          t.id === input.txId
            ? {
                ...t,
                ...(input.amountCents !== undefined
                  ? { amountConvertedCents: input.amountCents.toString() }
                  : {}),
                ...(input.note !== undefined ? { note: input.note } : {}),
                ...(input.date !== undefined
                  ? { transactionDate: input.date }
                  : {}),
                pending: true,
              }
            : t,
        );
      });

      return { previous };
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["transactions", budgetId, month], ctx.previous);
      }
    },

    onSuccess: (serverRow, input) => {
      // serverRow is raw snake_case from serializeRow — map to the camelCase
      // TxnDTO the grid reads, otherwise the row renders blank until the
      // onSettled refetch and visibly flickers out and back in.
      const mapped = mapTxnRowToDTO(serverRow);
      qc.setQueryData(["transactions", budgetId, month], (old: unknown) => {
        const arr = Array.isArray(old) ? old : [];
        return arr.map((t: Record<string, unknown>) =>
          t.id === input.txId
            ? { ...mapped, pending: false, unsent: false }
            : t,
        );
      });
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["transactions", budgetId, month] });
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId, month],
      });
    },
  });
}
