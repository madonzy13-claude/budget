"use client";
/**
 * use-set-category-limit.ts — write one category's needs/wants split (260808).
 *
 * The Overview's limit dialog acts on the Future reading of "how much each
 * limit should change". The limits table is SCD-2, so this POSTs a new row
 * effective from the first of the current month — the same call the category
 * slider makes when a limit is edited, minus the name/colour half.
 *
 * `normalAmount` is needs + wants by definition (mig 0061): the planned figure
 * IS the split's total, and writing them apart would let the two disagree.
 * Cushion rides along unchanged — this dialog has no opinion about it.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";

export interface SetCategoryLimitInput {
  categoryId: string;
  needsCents: number;
  wantsCents: number;
  /** Left as it was — the limit dialog does not touch the cushion. */
  cushionCents: number;
}

export function useSetCategoryLimit(budgetId: string, month: string) {
  const qc = useQueryClient();
  const t = useTranslations("bdp.tab.overview");
  const offlineToast = useOfflineWriteToast();

  return useMutation({
    mutationFn: async (input: SetCategoryLimitInput) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/categories/${input.categoryId}/limits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            normalAmount: String(
              Math.round(input.needsCents) + Math.round(input.wantsCents),
            ),
            cushionAmount: String(Math.round(input.cushionCents)),
            needsAmount: String(Math.round(input.needsCents)),
            wantsAmount: String(Math.round(input.wantsCents)),
            effectiveFrom: `${month}-01`,
          }),
        },
      );
      if (!res.ok) throw new Error("set_limit_failed");
    },
    onError: (err) => {
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("planned.limitSaveFailed"));
    },
    onSettled: () => {
      // The split feeds the dialog, the grid and every chart drawn off a limit.
      void qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
      void qc.invalidateQueries({ queryKey: ["budget", budgetId, "overview"] });
      void qc.invalidateQueries({ queryKey: ["budget", budgetId, "planned"] });
      void qc.invalidateQueries({
        queryKey: ["budget", budgetId, "reserve-fit"],
      });
    },
  });
}
