"use client";
/**
 * use-reorder-holdings.ts — Optimistic POST /investments/reorder (Phase 9, INV-11).
 *
 * Drag-to-reorder within the section. The optimistic update rearranges the
 * cached array's sortOrder immediately; on error the previous order is restored.
 * Group reassignment is handled by useUpdateHolding (PATCH group). Reorder is
 * silent on success (no toast) per the UI-SPEC copy contract.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type { HoldingDto } from "./use-investments";

export interface ReorderHoldingsInput {
  orderedIds: string[];
}

export function useReorderHoldings(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments.toast");
  const offlineToast = useOfflineWriteToast();
  const key = ["budget", budgetId, "investments"] as const;

  return useMutation({
    mutationFn: async (input: ReorderHoldingsInput) => {
      const res = await clientApiWrite(`/investments/reorder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": generateIdempotencyKey(),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || "reorder_failed");
      }
      return (await res.json()) as { ok: true };
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<HoldingDto[]>(key);
      qc.setQueryData<HoldingDto[]>(key, (old) => {
        if (!old) return old;
        const orderMap = new Map(input.orderedIds.map((id, i) => [id, i + 1]));
        const next = old.map((h) =>
          orderMap.has(h.id) ? { ...h, sortOrder: orderMap.get(h.id)! } : h,
        );
        next.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        return next;
      });
      return { previous };
    },

    onError: (err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("reorderFailed"));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
