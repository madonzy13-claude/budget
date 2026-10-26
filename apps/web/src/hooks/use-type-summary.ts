"use client";
/**
 * use-type-summary.ts — Phase 13 type groups (D-12/D-14/D-15).
 *
 * useTypeSummary: realized + sold cost per type (incl. types with no holdings
 * left) and the saved per-budget type order. Kept OUT of the holdings cache so
 * optimistic holding mutations keep operating on a plain HoldingDto[].
 * useSetTypeOrder: optimistic order, honest-offline write, rollback + toast.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clientApiFetch } from "@/lib/budget-fetch";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import type { TypeSummaryDto } from "@/lib/investment-type-groups";

export const typeSummaryKey = (budgetId: string) =>
  ["budget", budgetId, "investments", "type-summary"] as const;

export function useTypeSummary(budgetId: string) {
  return useQuery({
    queryKey: typeSummaryKey(budgetId),
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investments/type-summary`,
        { signal: AbortSignal.timeout(7000) },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as TypeSummaryDto;
    },
  });
}

export function useSetTypeOrder(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments.sell");
  const offlineToast = useOfflineWriteToast();
  const key = typeSummaryKey(budgetId);

  return useMutation({
    mutationFn: async (order: string[]) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/investments/type-order`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { order: string[] };
    },
    onMutate: async (order) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TypeSummaryDto>(key);
      if (previous)
        qc.setQueryData<TypeSummaryDto>(key, { ...previous, order });
      return { previous };
    },
    onError: (err, _order, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("errSave"));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
