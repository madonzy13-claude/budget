"use client";
/**
 * use-dismiss-draft.ts — Mutation to dismiss (skip) a pending recurring draft.
 *
 * POST /budgets/:budgetId/recurring-rules/drafts/:draftId/dismiss
 * D-PH4-R3: dismiss = dismissed_at = now() on this occurrence only.
 * Recurring rule keeps running; next occurrence will generate a new draft.
 *
 * On success: invalidates ["drafts", ...] + ["spendings-summary", ...]
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";

export function useDismissDraft(budgetId: string, month: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/recurring-rules/drafts/${draftId}/dismiss`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": generateIdempotencyKey(),
          },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      // Server returns 204 No Content on success — calling res.json() on an
      // empty body throws SyntaxError, which silently fails the mutation
      // and rolls the row back. Return null instead.
      return null;
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["drafts", budgetId, month] });
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId, month],
      });
    },
  });
}
