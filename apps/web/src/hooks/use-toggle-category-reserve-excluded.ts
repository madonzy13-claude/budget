"use client";
/**
 * use-toggle-category-reserve-excluded.ts — Mutation to toggle a category's
 * reserve_excluded flag via PATCH /budgets/:id/categories/:categoryId/reserve-excluded.
 *
 * W-3 optimistic row-move contract:
 *   excluded=true  → move row from summary.rows → summary.excludedRows (strip share fields)
 *                    and DECREMENT totals.totalCategoryReservesCents by its balance.
 *   excluded=false → move row from summary.excludedRows → summary.rows (share fields null
 *                    until refetch computes real share math)
 *                    and INCREMENT totals.totalCategoryReservesCents by its balance.
 * In both cases: recompute mismatchCents = totalReserveWalletAmountCents - totalCategoryReservesCents.
 *
 * On success: invalidate ["budget", budgetId, "reserves"] so real share math populates.
 * On error: roll back via captured previous snapshot + toast toggleFailed.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type {
  ReservesSummaryDto,
  ReservesSummaryRow,
} from "./use-reserves-summary";

export function useToggleCategoryReserveExcluded(budgetId: string) {
  const qc = useQueryClient();

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
            // Active → Excluded: find in rows, strip share fields, append to excludedRows
            const idx = old.rows.findIndex(
              (r) => r.categoryId === input.categoryId,
            );
            if (idx < 0) return old;
            const row = old.rows[idx]!;
            const movedRow: ReservesSummaryRow = {
              ...row,
              walletSharePercent: null,
              walletShareAmountCents: null,
            };
            const newRows = [
              ...old.rows.slice(0, idx),
              ...old.rows.slice(idx + 1),
            ];
            const newTotal = (
              BigInt(old.totals.totalCategoryReservesCents) -
              BigInt(row.reserveBalanceCents)
            ).toString();
            const newMismatch = (
              BigInt(old.totals.totalReserveWalletAmountCents) -
              BigInt(newTotal)
            ).toString();
            return {
              ...old,
              rows: newRows,
              excludedRows: [...old.excludedRows, movedRow],
              totals: {
                ...old.totals,
                totalCategoryReservesCents: newTotal,
                mismatchCents: newMismatch,
              },
            };
          } else {
            // Excluded → Active: find in excludedRows, append to rows
            const idx = old.excludedRows.findIndex(
              (r) => r.categoryId === input.categoryId,
            );
            if (idx < 0) return old;
            const row = old.excludedRows[idx]!;
            const newExcluded = [
              ...old.excludedRows.slice(0, idx),
              ...old.excludedRows.slice(idx + 1),
            ];
            const newTotal = (
              BigInt(old.totals.totalCategoryReservesCents) +
              BigInt(row.reserveBalanceCents)
            ).toString();
            const newMismatch = (
              BigInt(old.totals.totalReserveWalletAmountCents) -
              BigInt(newTotal)
            ).toString();
            return {
              ...old,
              rows: [
                ...old.rows,
                {
                  ...row,
                  walletSharePercent: null,
                  walletShareAmountCents: null,
                },
              ],
              excludedRows: newExcluded,
              totals: {
                ...old.totals,
                totalCategoryReservesCents: newTotal,
                mismatchCents: newMismatch,
              },
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
      toast.error("bdp.tab.reserves.toast.toggleFailed");
    },

    onSuccess: (_data, input) => {
      if (input.excluded) {
        toast.success("bdp.tab.reserves.toast.excluded");
      } else {
        toast.success("bdp.tab.reserves.toast.included");
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
    },
  });
}
