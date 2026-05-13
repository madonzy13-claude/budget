"use client";
/**
 * use-create-transaction.ts — Optimistic POST mutation for new transactions.
 *
 * Pattern 2 (RESEARCH §Pattern 2): onMutate prepends optimistic row,
 * onError flags unsent (NOT rollback — D-PH4-Q1 keeps row visible),
 * onSuccess swaps server row in, onSettled invalidates spendings-summary.
 *
 * QueryKey ["transactions", budgetId, month] matches useTransactions exactly.
 * T-04-03-02: optimistic UUID is client-local; server assigns its own id.
 * T-04-03-03: fresh Idempotency-Key per mutation via generateIdempotencyKey().
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";

export interface CreateTransactionInput {
  categoryId: string;
  amountCents: number;
  date: string;
  currency: string;
  note?: string | null;
}

/**
 * Optimistically recomputes spentCents for the target category.
 * D-PH4-R4: ~50ms local recompute before server reconciles.
 * Uses BigInt math to avoid float precision issues.
 */
function recomputeOptimistic(
  summary: Record<string, unknown> | undefined,
  input: CreateTransactionInput,
) {
  if (!summary) return summary;
  const cats = (summary as { categories?: Array<Record<string, unknown>> })
    .categories;
  if (!cats) return summary;
  return {
    ...summary,
    categories: cats.map((cat) => {
      if (cat.categoryId !== input.categoryId) return cat;
      const spentCents = BigInt(String(cat.spentCents ?? "0"));
      const newSpent = spentCents + BigInt(input.amountCents);
      const activeBudgetCents = BigInt(String(cat.activeBudgetCents ?? "0"));
      const newBalance = activeBudgetCents - newSpent;
      const overspent = newBalance < 0n ? (-newBalance).toString() : "0";
      return {
        ...cat,
        spentCents: newSpent.toString(),
        balanceCents: newBalance.toString(),
        overspentCents: overspent,
      };
    }),
  };
}

export function useCreateTransaction(budgetId: string, month: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTransactionInput) => {
      const res = await clientApiFetch(`/budgets/${budgetId}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": generateIdempotencyKey(),
        },
        body: JSON.stringify({
          date: input.date,
          category_id: input.categoryId,
          amount_original_cents: input.amountCents,
          currency_original: input.currency,
          note: input.note ?? null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()).transaction;
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["transactions", budgetId, month] });
      const previous = qc.getQueryData(["transactions", budgetId, month]);
      const optimisticId = `opt-${generateIdempotencyKey()}`;

      qc.setQueryData(["transactions", budgetId, month], (old: unknown) => {
        const arr = Array.isArray(old) ? old : [];
        return [
          {
            id: optimisticId,
            pending: true,
            unsent: false,
            categoryId: input.categoryId,
            amountConvertedCents: input.amountCents.toString(),
            currencyConverted: input.currency,
            transactionDate: input.date,
            confirmedAt: new Date().toISOString(),
            note: input.note ?? null,
          },
          ...arr,
        ];
      });

      qc.setQueryData(["spendings-summary", budgetId, month], (old: unknown) =>
        recomputeOptimistic(old as Record<string, unknown>, input),
      );

      return { previous, optimisticId };
    },

    onError: (_err, _input, ctx) => {
      if (!ctx) return;
      // Flag unsent — do NOT roll back (D-PH4-Q1 keeps row visible with retry)
      qc.setQueryData(["transactions", budgetId, month], (old: unknown) => {
        const arr = Array.isArray(old) ? old : [];
        return arr.map((t: Record<string, unknown>) =>
          t.id === ctx.optimisticId
            ? { ...t, pending: false, unsent: true }
            : t,
        );
      });
    },

    onSuccess: (serverRow, _input, ctx) => {
      qc.setQueryData(["transactions", budgetId, month], (old: unknown) => {
        const arr = Array.isArray(old) ? old : [];
        return arr.map((t: Record<string, unknown>) =>
          t.id === ctx?.optimisticId
            ? { ...serverRow, pending: false, unsent: false }
            : t,
        );
      });
    },

    onSettled: () => {
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId, month],
      });
      qc.invalidateQueries({
        queryKey: ["transactions", budgetId, month],
      });
    },
  });
}
