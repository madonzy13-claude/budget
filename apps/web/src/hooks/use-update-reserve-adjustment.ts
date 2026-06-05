"use client";
/**
 * use-update-reserve-adjustment.ts — Mutation to POST a reserve adjustment.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md / 05-14 contract): the adjust
 * call sets the TARGET reserve value for one category. The server computes the
 * signed ledger delta (delta = Xtarget − currentR), appends it, replays the
 * engine, and returns `{ reserveCents, deltaCents, summary }` where `summary`
 * is the authoritative new ReservesSummaryDto.
 *
 * Optimistic (trivial new model — NO greedy allocator): on adjust(cat, X) set
 * that row's reserveCents = X locally, then recompute
 *   totals.internalCents = Σ active rows.reserveCents
 *   totals.surplusCents   = userDefinedCents − internal
 *   totals.direction      = internal>userDefined ? TOPUP : internal<userDefined ? WITHDRAW : NONE
 * On settle the cache is replaced by the server's `summary` (authoritative).
 *
 * POST /budgets/:id/reserves/:categoryId/adjust
 * body: { expectedCents: number, note?: string }
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type {
  ReservesSummaryDto,
  ReservesSummaryTotals,
} from "./use-reserves-summary";

/**
 * Recompute internal/surplus/direction after a single row's reserve changed.
 * Internal = Σ active rows.reserveCents; surplus = userDefined − internal.
 * Exported for unit testing.
 */
export function recomputeTotals(
  rows: ReservesSummaryDto["rows"],
  prev: ReservesSummaryTotals,
): ReservesSummaryTotals {
  const internal = rows.reduce((sum, r) => sum + BigInt(r.reserveCents), 0n);
  const userDefined = BigInt(prev.userDefinedCents);
  const surplus = userDefined - internal;
  const direction: ReservesSummaryTotals["direction"] =
    surplus < 0n ? "TOPUP" : surplus > 0n ? "WITHDRAW" : "NONE";
  return {
    ...prev,
    internalCents: internal.toString(),
    surplusCents: surplus.toString(),
    direction,
  };
}

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
      return (await res.json()) as {
        reserveCents?: string;
        deltaCents?: string;
        summary?: ReservesSummaryDto;
        [k: string]: unknown;
      };
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["budget", budgetId, "reserves"] });
      const previous = qc.getQueryData<ReservesSummaryDto>([
        "budget",
        budgetId,
        "reserves",
      ]);
      if (!previous) return { previous };

      // Trivial new model: set the target active row's reserve to X, recompute
      // internal/surplus/direction. Excluded rows never participate in totals.
      const nextRows = previous.rows.map((r) =>
        r.categoryId === input.categoryId
          ? { ...r, reserveCents: String(input.expectedCents) }
          : r,
      );
      qc.setQueryData<ReservesSummaryDto>(["budget", budgetId, "reserves"], {
        ...previous,
        rows: nextRows,
        totals: recomputeTotals(nextRows, previous.totals),
      });

      return { previous };
    },

    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["budget", budgetId, "reserves"], ctx.previous);
      }
      toast.error(t("saveFailed"));
    },

    onSuccess: (data) => {
      // Server returned the authoritative summary — snap to it (no refetch).
      if (data?.summary) {
        qc.setQueryData(["budget", budgetId, "reserves"], data.summary);
      }
      toast.success(t("saved"));
      // Adjust fires recomputeReserveTopupTask server-side — refresh the badge.
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
    },
  });
}
