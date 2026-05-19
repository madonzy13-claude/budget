"use client";
/**
 * use-update-reserve-adjustment.ts — Mutation to POST a reserve balance adjustment.
 *
 * UAT-PH5-T3-54: input is the TARGET expected value (cents, non-negative),
 * not a signed delta. Server appends `newExpected - oldExpected` to the ledger
 * and mutates `categories.reserve_actual_cents` via the allocator.
 *
 * POST /budgets/:id/reserves/:categoryId/adjust
 * body: { expectedCents: number, note?: string }
 *
 * Optimistic: overwrites reserveBalanceCents on the row to the new target.
 * W-3: only touches summary.rows (Active); excludedRows untouched.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type { ReservesSummaryDto } from "./use-reserves-summary";

export function useUpdateReserveAdjustment(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("bdp.tab.reserves.toast");

  return useMutation({
    mutationFn: async (input: {
      categoryId: string;
      expectedCents: number;
      note?: string;
    }) => {
      const body: { expectedCents: number; note?: string } = {
        expectedCents: input.expectedCents,
      };
      if (input.note !== undefined) body.note = input.note;

      const res = await clientApiFetch(
        `/budgets/${budgetId}/reserves/${input.categoryId}/adjust`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": generateIdempotencyKey(),
          },
          body: JSON.stringify(body),
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
          return {
            ...old,
            rows: old.rows.map((r) =>
              r.categoryId === input.categoryId
                ? {
                    ...r,
                    reserveBalanceCents: input.expectedCents.toString(),
                  }
                : r,
            ),
          };
        },
      );

      return { previous };
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["budget", budgetId, "reserves"], ctx.previous);
      }
      toast.error(t("saveFailed"));
    },

    onSuccess: () => {
      toast.success(t("saved"));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
    },
  });
}
