"use client";
/**
 * use-update-reserve-adjustment.ts — Mutation to POST a reserve balance adjustment.
 *
 * POST /budgets/:id/reserves/:categoryId/adjust
 * body: { deltaCents: number (signed, nonzero), note?: string }
 *
 * D-PH5-R7: caller computes delta = newAbsoluteValue - currentEffectiveBalance.
 * Optimistic: updates the row's reserveBalanceCents in the Active rows cache.
 * W-3: only touches summary.rows (Active); summary.excludedRows is never mutated here.
 * On error: rolls back + toasts bdp.tab.reserves.toast.saveFailed.
 * On success: toasts bdp.tab.reserves.toast.saved + invalidates query.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type { ReservesSummaryDto } from "./use-reserves-summary";

/**
 * Compute the signed delta to POST to /adjust.
 * Both inputs are cents as bigints.
 */
export function computeDelta(newCents: bigint, currentCents: bigint): bigint {
  return newCents - currentCents;
}

export function useUpdateReserveAdjustment(budgetId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      categoryId: string;
      deltaCents: number;
      note?: string;
    }) => {
      const body: { deltaCents: number; note?: string } = {
        deltaCents: input.deltaCents,
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
                    reserveBalanceCents: (
                      BigInt(r.reserveBalanceCents) + BigInt(input.deltaCents)
                    ).toString(),
                  }
                : r,
            ),
            // W-3: excludedRows are NOT touched — frozen real balances stay intact
          };
        },
      );

      return { previous };
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["budget", budgetId, "reserves"], ctx.previous);
      }
      toast.error("bdp.tab.reserves.toast.saveFailed");
    },

    onSuccess: () => {
      toast.success("bdp.tab.reserves.toast.saved");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
    },
  });
}
