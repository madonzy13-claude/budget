"use client";
/**
 * use-update-holding.ts — Optimistic PATCH /investments/:id mutation (Phase 9).
 *
 * Mirrors use-update-wallet: optimistic field patch on the cached row, rollback
 * on error, invalidate on settle. clientApiWrite gives honest-offline behaviour.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type { HoldingDto, HoldingType } from "./use-investments";

export interface UpdateHoldingInput {
  holdingId: string;
  name?: string;
  holdingType?: HoldingType;
  uiType?: string | null;
  group?: string | null;
  instrumentId?: string | null;
  buyPriceCents?: string | number | null;
  buyCurrency?: string | null;
  quantity?: string;
  currentPriceCents?: string | number | null;
  currentPriceCurrency?: string | null;
  metal?: string | null;
  metalKind?: string | null;
  unitOfMeasure?: string | null;
  manualTicker?: string | null;
  /** Web-only optimistic ticker; the server derives the persisted symbol. */
  symbol?: string | null;
  /** Suppress the "saved" toast — drag-to-group reassignment is silent (UAT). */
  silent?: boolean;
}

export function useUpdateHolding(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments.toast");
  const offlineToast = useOfflineWriteToast();
  const key = ["budget", budgetId, "investments"] as const;

  return useMutation({
    mutationFn: async (input: UpdateHoldingInput) => {
      // `silent` is a client-only toast flag — strip it from the PATCH body.
      const { holdingId, ...rest } = input;
      const payload: Record<string, unknown> = { ...rest };
      delete payload.silent;
      const res = await clientApiWrite(
        `/budgets/${budgetId}/investments/${holdingId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": generateIdempotencyKey(),
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        const err: Error & { code?: string | null } = new Error(body);
        try {
          err.code = (JSON.parse(body) as { error?: string })?.error ?? null;
        } catch {
          err.code = null;
        }
        throw err;
      }
      return (await res.json()) as { id: string };
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<HoldingDto[]>(key);
      qc.setQueryData<HoldingDto[]>(key, (old) => {
        if (!old) return old;
        return old.map((h) =>
          h.id === input.holdingId
            ? {
                ...h,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.holdingType !== undefined
                  ? { holdingType: input.holdingType }
                  : {}),
                ...(input.group !== undefined ? { group: input.group } : {}),
                ...(input.currentPriceCents !== undefined
                  ? { currentPriceCents: String(input.currentPriceCents) }
                  : {}),
                ...(input.currentPriceCurrency !== undefined
                  ? { currentPriceCurrency: input.currentPriceCurrency }
                  : {}),
                ...(input.buyCurrency !== undefined
                  ? { buyCurrency: input.buyCurrency }
                  : {}),
                ...(input.quantity !== undefined
                  ? { quantity: input.quantity }
                  : {}),
                ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
              }
            : h,
        );
      });
      return { previous };
    },

    onError: (err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("saveFailed"));
    },

    onSuccess: (_data, vars) => {
      if (!vars.silent) toast.success(t("saved"));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
