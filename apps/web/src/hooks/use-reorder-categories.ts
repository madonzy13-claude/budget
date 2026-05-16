"use client";
/**
 * use-reorder-categories.ts — Optimistic drag-reorder mutation.
 *
 * queryKey: ["categories", budgetId]
 * On error: revert local reorder + show toast (grid.error.reorderSave).
 * On success: invalidate ["categories", budgetId].
 *
 * D-PH4-D2: persists via PUT /budgets/:id/categories/sort-order
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { toast } from "sonner";

export interface ReorderInput {
  orderedIds: string[];
}

export function useReorderCategories(budgetId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReorderInput) => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/categories/sort-order`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds: input.orderedIds }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      // PUT /categories/sort-order returns 204 No Content — there is no body
      // to parse. Calling res.json() on an empty body throws and would make a
      // successful reorder look like a failure (optimistic rollback).
      return null;
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["categories", budgetId] });
      const previous = qc.getQueryData(["categories", budgetId]);

      // Optimistically reorder
      qc.setQueryData(["categories", budgetId], (old: unknown) => {
        if (!Array.isArray(old)) return old;
        const idxMap = new Map(input.orderedIds.map((id, i) => [id, i]));
        return [...old].sort(
          (a: Record<string, unknown>, b: Record<string, unknown>) => {
            const ai = idxMap.get(a.id as string) ?? 999;
            const bi = idxMap.get(b.id as string) ?? 999;
            return ai - bi;
          },
        );
      });

      return { previous };
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["categories", budgetId], ctx.previous);
      }
      toast.error("grid.error.reorderSave");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["categories", budgetId] });
    },
  });
}
