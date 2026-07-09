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
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { generateIdempotencyKey } from "@/lib/idempotency";

export function useDismissDraft(budgetId: string, month: string) {
  const qc = useQueryClient();
  const t = useTranslations("grid.txn.write");
  const offlineToast = useOfflineWriteToast();

  return useMutation({
    mutationFn: async (draftId: string) => {
      const res = await clientApiWrite(
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

    onError: (err: unknown) => {
      // Honest-offline: refused write shows the shared offline toast, not generic.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("failed"));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["drafts", budgetId, month] });
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId, month],
      });
      // UAT round 11: dismissing a draft auto-resolves its CONFIRM_DRAFT
      // task server-side. Invalidate tasks so the badge / slider drop the
      // row within ~1 tick.
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
      // Cash-flow projection inputs changed — refresh the banner.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "projection"] });
    },
  });
}
