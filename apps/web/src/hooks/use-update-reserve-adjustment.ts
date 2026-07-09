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
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
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

/**
 * When the adjust's added reserve is fully/partially consumed covering THIS
 * month's overspend, the resulting reserve lands BELOW the typed target
 * (`reserveCents < expectedCents`). `cover = expectedCents − reserveCents`.
 * The caller (reserves island) uses `onCoverDetected` to show the acknowledge
 * popup + count-down reveal; the hook then DEFERS the authoritative cache snap
 * so the optimistic (pre-settle) numbers stay on screen until the reveal runs.
 */
export interface UpdateReserveAdjustmentOpts {
  onCoverDetected?: (e: {
    categoryId: string;
    coverCents: bigint;
    summary: ReservesSummaryDto;
  }) => void;
}

export function useUpdateReserveAdjustment(
  budgetId: string,
  opts: UpdateReserveAdjustmentOpts = {},
) {
  const qc = useQueryClient();
  const t = useTranslations("bdp.tab.reserves.toast");
  const offlineToast = useOfflineWriteToast();

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

      const res = await clientApiWrite(
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

    onError: (err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["budget", budgetId, "reserves"], ctx.previous);
      }
      // Honest-offline: an offline/unreachable/hung write shows the shared toast.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("saveFailed"));
    },

    onSuccess: (data, variables) => {
      // Adjust fires recomputeReserveTopupTask server-side — refresh the badge.
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });

      // A reserve adjust changes per-category reserveUsed / overspent / balance
      // on the SPENDINGS grid too. Invalidate every month's spendings-summary so
      // it refetches in the BACKGROUND (the cached version still renders first —
      // invalidateQueries marks it stale, not absent — and the fresh data swaps
      // in when it lands). Without this, navigating Reserves → Spendings after an
      // adjust showed stale numbers until a full page reload. Fired in EVERY
      // success path (including the cover branch below, which returns early).
      qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });

      // Cash-flow projection inputs changed — refresh the banner.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "projection"] });

      // Did part of the added reserve cover THIS month's overspend? cover =
      // typed target − resulting reserve. When it did (and a caller wants the
      // reveal), DEFER the snap: keep the optimistic numbers on screen so the
      // popup + count-down can run, then the caller applies `summary` itself.
      const cover =
        data?.reserveCents !== undefined
          ? BigInt(variables.expectedCents) - BigInt(data.reserveCents)
          : 0n;
      if (data?.summary && cover > 0n && opts.onCoverDetected) {
        opts.onCoverDetected({
          categoryId: variables.categoryId,
          coverCents: cover,
          summary: data.summary,
        });
        return; // no snap, no generic toast — the popup is the acknowledgment
      }

      // Server returned the authoritative summary — snap to it (no refetch).
      if (data?.summary) {
        qc.setQueryData(["budget", budgetId, "reserves"], data.summary);
      }
      toast.success(t("saved"));
    },
  });
}
