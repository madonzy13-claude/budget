"use client";
/**
 * use-toggle-category-reserve-excluded.ts — Mutation to toggle a category's
 * reserve_excluded flag via PATCH /budgets/:id/categories/:categoryId/reserve-excluded.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md): rows carry the engine shape
 * {reserveCents, usedCents, overspentCents}; totals carry
 * {internalCents, userDefinedCents, surplusCents, direction, ...}. Excluding a
 * category drops its reserve out of internal (Σ active R); restoring adds it
 * back. Surplus = userDefined − internal; direction follows the sign.
 *
 * W-3 optimistic row-move contract:
 *   excluded=true  → move row from summary.rows → summary.excludedRows;
 *                    recompute internal/surplus/direction without it.
 *   excluded=false → move row from summary.excludedRows → summary.rows;
 *                    recompute internal/surplus/direction including it.
 *
 * On success/settle: invalidate ["budget", budgetId, "reserves"] so the engine
 * re-derives the authoritative positions.
 * On error: roll back via captured previous snapshot + toast toggleFailed.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type { ReservesSummaryDto } from "./use-reserves-summary";
import { recomputeTotals } from "./use-update-reserve-adjustment";

export function useToggleCategoryReserveExcluded(budgetId: string) {
  const qc = useQueryClient();
  // UAT-PH5-T3-35: translate toast strings.
  const t = useTranslations("bdp.tab.reserves.toast");

  return useMutation({
    mutationFn: async (input: {
      categoryId: string;
      excluded: boolean;
      categoryName: string;
    }) => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/categories/${input.categoryId}/reserve-excluded`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": generateIdempotencyKey(),
          },
          body: JSON.stringify({ excluded: input.excluded }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["budget", budgetId, "reserves"] });
      const previous = qc.getQueryData<ReservesSummaryDto>([
        "budget",
        budgetId,
        "reserves",
      ]);

      qc.setQueryData<ReservesSummaryDto>(
        ["budget", budgetId, "reserves"],
        (old) => {
          if (!old) return old;

          if (input.excluded) {
            // Active → Excluded: find in rows, append to excludedRows.
            const idx = old.rows.findIndex(
              (r) => r.categoryId === input.categoryId,
            );
            if (idx < 0) return old;
            const row = old.rows[idx]!;
            const newRows = [
              ...old.rows.slice(0, idx),
              ...old.rows.slice(idx + 1),
            ];
            return {
              ...old,
              rows: newRows,
              excludedRows: [...old.excludedRows, row],
              totals: recomputeTotals(newRows, old.totals),
            };
          } else {
            // Excluded → Active: find in excludedRows, append to rows.
            const idx = old.excludedRows.findIndex(
              (r) => r.categoryId === input.categoryId,
            );
            if (idx < 0) return old;
            const row = old.excludedRows[idx]!;
            const newExcluded = [
              ...old.excludedRows.slice(0, idx),
              ...old.excludedRows.slice(idx + 1),
            ];
            const newRows = [...old.rows, row];
            return {
              ...old,
              rows: newRows,
              excludedRows: newExcluded,
              totals: recomputeTotals(newRows, old.totals),
            };
          }
        },
      );

      return { previous };
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["budget", budgetId, "reserves"], ctx.previous);
      }
      toast.error(t("toggleFailed"));
    },

    onSuccess: (_data, input) => {
      if (input.excluded) {
        toast.success(t("excluded", { category: input.categoryName }));
      } else {
        toast.success(t("included", { category: input.categoryName }));
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
    },
  });
}
