"use client";
/**
 * use-reorder-categories.ts — Optimistic drag-reorder mutation.
 *
 * queryKey: ["budget", budgetId, "categories"] — the SAME key useCategories
 * (use-budget-data.ts) reads. The grid seeds its localCategoryOrder from that
 * query, so onSettled MUST invalidate this exact key or the SPA grid never
 * re-fetches the persisted order (SPA refactor 260616). The old standalone
 * ["categories", budgetId] key was dead — nothing read it.
 * On error: revert local reorder + show toast (grid.error.reorderSave).
 * On success: invalidate ["budget", budgetId, "categories"].
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
      await qc.cancelQueries({ queryKey: ["budget", budgetId, "categories"] });
      const previous = qc.getQueryData(["budget", budgetId, "categories"]);

      // Optimistically reorder
      qc.setQueryData(["budget", budgetId, "categories"], (old: unknown) => {
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
        qc.setQueryData(["budget", budgetId, "categories"], ctx.previous);
      }
      toast.error("grid.error.reorderSave");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "categories"] });
    },
  });
}
