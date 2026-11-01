"use client";
/**
 * use-update-holding.ts — PATCH /investments/:id = asset Edit (Phase 13.1, D-06).
 *
 * Sends ONLY label, display currency and the hand value/price. Quantity, cost
 * and type are ledger-owned: a PATCH that wrote them raced /adjust (Phase 13
 * CR-01, UAT T6). Optimistic name/price patch, rollback on error.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import {
  AssetWriteError,
  assetRefusalKey,
  assetWrite,
  invalidateInvestments,
} from "@/lib/investment-invalidate";
import type { HoldingDto } from "./use-investments";

export interface UpdateHoldingInput {
  holdingId: string;
  name?: string;
  /** D-36: the server converts the stored current value at today's rate. */
  displayCurrency?: string;
  /** Hand-valued amount assets: new total value. */
  currentValueCents?: string;
  /** Hand-priced quantity assets: new price per unit. */
  currentPriceCents?: string;
  /** Suppress the error toast; the caller shows it inline. */
  silent?: boolean;
}

export function useUpdateHolding(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments");
  const offlineToast = useOfflineWriteToast();
  const key = ["budget", budgetId, "investments"] as const;

  return useMutation({
    mutationFn: ({ holdingId, silent: _silent, ...edit }: UpdateHoldingInput) =>
      assetWrite<{ id: string }>(
        `/budgets/${budgetId}/investments/${holdingId}`,
        "PATCH",
        edit,
      ),

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key, exact: true });
      const previous = qc.getQueryData<HoldingDto[]>(key);
      qc.setQueryData<HoldingDto[]>(key, (old) =>
        old?.map((h) =>
          h.id === input.holdingId
            ? {
                ...h,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.currentPriceCents !== undefined
                  ? { currentPriceCents: input.currentPriceCents }
                  : {}),
              }
            : h,
        ),
      );
      return { previous };
    },

    onError: (err, input, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      if (isOfflineWriteError(err)) return offlineToast();
      if (input.silent) return;
      toast.error(t(assetRefusalKey((err as AssetWriteError).code ?? "")));
    },

    onSettled: () =>
      invalidateInvestments(qc, budgetId, { walletTouched: false }),
  });
}
