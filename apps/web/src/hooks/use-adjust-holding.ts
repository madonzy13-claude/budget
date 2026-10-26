"use client";
/**
 * use-adjust-holding.ts — POST /investments/:id/adjust (Phase 13, D-03).
 * Edit → "What happened?": value changed / added money / withdrew money /
 * bought more. Refetch, no optimistic rewrite (cost, realized, contributions
 * and history all move). Honest-offline via clientApiWrite.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";

export type AdjustBody =
  | {
      kind: "value_change" | "add";
      newValueCents: string;
      effectiveDate: string;
    }
  | {
      kind: "withdraw";
      newValueCents: string;
      receivedCents: string;
      receivedCurrency: string;
      effectiveDate: string;
    }
  | {
      kind: "buy";
      addQuantity: string;
      paidCents: string;
      effectiveDate: string;
    };

export function useAdjustHolding(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments");
  const offlineToast = useOfflineWriteToast();
  return useMutation({
    mutationFn: async ({
      holdingId,
      body,
    }: {
      holdingId: string;
      body: AdjustBody;
    }) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/investments/${holdingId}/adjust`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { ok: true };
    },
    onError: (e) => {
      if (isOfflineWriteError(e)) return offlineToast();
      toast.error(t("sell.errSave"));
    },
    onSettled: () => {
      void qc.invalidateQueries({
        queryKey: ["budget", budgetId, "investments"],
      });
      void qc.invalidateQueries({ queryKey: ["budget", budgetId, "overview"] });
    },
  });
}
