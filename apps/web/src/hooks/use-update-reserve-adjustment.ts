"use client";
/**
 * use-update-reserve-adjustment.ts — Mutation to POST a reserve balance adjustment.
 *
 * UAT-PH5-T3-54: target value (not delta). Server appends ledger delta + mutates
 *   reserve_actual_cents AND returns the full new ReservesSummaryDto in `summary`.
 *
 * Perf option B: onMutate runs `applyExpectedChange` locally so the UI snaps
 *   to the predicted final state immediately (including sibling clamps + share %
 *   recompute). On server response, snap to authoritative summary — no refetch.
 *
 * POST /budgets/:id/reserves/:categoryId/adjust
 * body: { expectedCents: number, note?: string }
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import { applyExpectedChange, type ReserveRow } from "@/lib/reserve-allocator";
import type { ReservesSummaryDto } from "./use-reserves-summary";

function summaryToRows(s: ReservesSummaryDto): ReserveRow[] {
  // Both rows + excludedRows share the same shape; we keep both for the
  // allocator (it skips excluded internally). sortIndex isn't carried by the
  // DTO — fall back to the array order, which already matches sort_index.
  const out: ReserveRow[] = [];
  s.rows.forEach((r, i) =>
    out.push({
      categoryId: r.categoryId,
      sortIndex: i,
      reserveExcluded: false,
      expectedCents: BigInt(r.reserveBalanceCents),
      actualCents: BigInt(r.walletShareAmountCents ?? "0"),
    }),
  );
  s.excludedRows.forEach((r, i) =>
    out.push({
      categoryId: r.categoryId,
      sortIndex: 10_000 + i,
      reserveExcluded: true,
      expectedCents: BigInt(r.reserveBalanceCents),
      actualCents: 0n,
    }),
  );
  return out;
}

/** Build a new summary from the allocator's row snapshot. */
function projectSummary(
  base: ReservesSummaryDto,
  rows: ReserveRow[],
): ReservesSummaryDto {
  const walletPool = BigInt(base.totals.totalReserveWalletAmountCents);
  const activeRows = rows.filter((r) => !r.reserveExcluded);
  const sumActiveActual = activeRows.reduce((s, r) => s + r.actualCents, 0n);
  const totalExpected = activeRows.reduce((s, r) => s + r.expectedCents, 0n);

  const projectedRows = base.rows.map((row) => {
    const r = rows.find(
      (x) => x.categoryId === row.categoryId && !x.reserveExcluded,
    );
    if (!r) return row;
    const sharePct =
      sumActiveActual === 0n
        ? null
        : Number((r.actualCents * 10000n) / sumActiveActual) / 100;
    return {
      ...row,
      reserveBalanceCents: r.expectedCents.toString(),
      walletSharePercent: sharePct,
      walletShareAmountCents:
        sumActiveActual === 0n ? null : r.actualCents.toString(),
    };
  });

  return {
    ...base,
    rows: projectedRows,
    totals: {
      ...base.totals,
      totalCategoryReservesCents: totalExpected.toString(),
      mismatchCents: (walletPool - totalExpected).toString(),
    },
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

      try {
        const rows = summaryToRows(previous);
        const walletPool = BigInt(
          previous.totals.totalReserveWalletAmountCents,
        );
        const alloc = applyExpectedChange(
          rows,
          walletPool,
          input.categoryId,
          BigInt(input.expectedCents),
        );
        qc.setQueryData<ReservesSummaryDto>(
          ["budget", budgetId, "reserves"],
          projectSummary(previous, alloc.rows),
        );
      } catch {
        // Fallback: simple overwrite of the row balance.
        qc.setQueryData<ReservesSummaryDto>(
          ["budget", budgetId, "reserves"],
          (old) =>
            old
              ? {
                  ...old,
                  rows: old.rows.map((r) =>
                    r.categoryId === input.categoryId
                      ? {
                          ...r,
                          reserveBalanceCents: input.expectedCents.toString(),
                        }
                      : r,
                  ),
                }
              : old,
        );
      }

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
      // Tasks redesign: backend adjust-category-reserve fires recomputeReserveTopupTask.
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
    },
  });
}
