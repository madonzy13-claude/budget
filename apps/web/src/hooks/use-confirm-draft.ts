"use client";
/**
 * use-confirm-draft.ts — Mutation to confirm a pending scheduled draft.
 *
 * POST /budgets/:budgetId/scheduled-payments/drafts/:draftId/confirm
 * On success: invalidates ["drafts", ...] + ["transactions", ...] + ["spendings-summary", ...]
 * Server moves the row from draft (confirmed_at=NULL) → confirmed.
 *
 * D-PH4-INT5: double-click amount + Enter calls this with optional amountOverride.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { addPendingDraftConfirm } from "@/lib/pending-spendings";
import { generateIdempotencyKey } from "@/lib/idempotency";

export interface ConfirmDraftInput {
  draftId: string;
  amountOverride?: number; // cents — if user edited amount before confirming
}

export function useConfirmDraft(budgetId: string, month: string) {
  const qc = useQueryClient();
  const t = useTranslations("grid.txn.write");
  const tPending = useTranslations("grid.txn.pending");

  return useMutation({
    mutationFn: async (input: ConfirmDraftInput) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/scheduled-payments/drafts/${input.draftId}/confirm`,
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
      // Server returns 204 No Content — calling res.json() on empty body
      // throws SyntaxError. Return null instead.
      return null;
    },

    onError: (err: unknown, input: ConfirmDraftInput) => {
      // 260731-osq round 2: an offline / unreachable confirm is QUEUED (like an
      // offline quick-add) and replayed on reconnect instead of being lost. The
      // draft row shows a retry marker until it lands.
      if (isOfflineWriteError(err)) {
        addPendingDraftConfirm({
          budgetId,
          month,
          draftId: input.draftId,
          amountOverrideCents: input.amountOverride ?? null,
        });
        toast.success(tPending("queued"));
        return;
      }
      toast.error(t("failed"));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["drafts", budgetId, month] });
      qc.invalidateQueries({ queryKey: ["transactions", budgetId, month] });
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId, month],
      });
      // UAT round 11: confirming a draft auto-resolves the CONFIRM_DRAFT
      // task server-side. Invalidate the per-budget tasks query so the
      // badge / slider drop the row within ~1 tick (no 60 s wait).
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
      // Cash-flow projection inputs changed — refresh the banner.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "projection"] });
    },
  });
}
