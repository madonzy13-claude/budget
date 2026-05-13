"use client";
/**
 * use-confirm-draft.ts — Mutation to confirm a pending recurring draft.
 *
 * POST /budgets/:budgetId/recurring-rules/drafts/:draftId/confirm
 * On success: invalidates ["drafts", ...] + ["transactions", ...] + ["spendings-summary", ...]
 * Server moves the row from draft (confirmed_at=NULL) → confirmed.
 *
 * D-PH4-INT5: double-click amount + Enter calls this with optional amountOverride.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";

export interface ConfirmDraftInput {
  draftId: string;
  amountOverride?: number; // cents — if user edited amount before confirming
}

export function useConfirmDraft(budgetId: string, month: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ConfirmDraftInput) => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/recurring-rules/drafts/${input.draftId}/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": generateIdempotencyKey(),
          },
          body: JSON.stringify(
            input.amountOverride !== undefined
              ? { amount_override_cents: input.amountOverride }
              : {},
          ),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["drafts", budgetId, month] });
      qc.invalidateQueries({ queryKey: ["transactions", budgetId, month] });
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId, month],
      });
    },
  });
}
