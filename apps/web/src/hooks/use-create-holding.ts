"use client";
/**
 * use-create-holding.ts — Optimistic POST /investments mutation (Phase 9, INV-16).
 *
 * Unlike wallets (staged-add on blur), holdings are created via the HoldingSheet
 * save, so an optimistic onMutate insert makes the row appear immediately; the
 * onSettled invalidate replaces it with the server-enriched row. All writes go
 * through clientApiWrite for honest-offline rollback + toast.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { persistNow } from "@/lib/query-persist";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import type { HoldingDto, HoldingType } from "./use-investments";

export interface CreateHoldingInput {
  name: string;
  holdingType: HoldingType;
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
  /** Bullion premium over spot, percent string ("20"=+20%); metals only. */
  premiumPct?: string | null;
  /** User-typed ticker for a manual (no-instrument) tracked holding. */
  manualTicker?: string | null;
  /** Ticker for the optimistic row (selected instrument symbol or manual ticker);
   *  the server derives the persisted symbol so it's not sent in the body schema. */
  symbol?: string | null;
}

function optimisticRow(input: CreateHoldingInput): HoldingDto {
  const valueCents =
    input.currentPriceCents != null
      ? String(input.currentPriceCents)
      : input.buyPriceCents != null
        ? String(input.buyPriceCents)
        : "0";
  return {
    id: crypto.randomUUID(),
    name: input.name,
    holdingType: input.holdingType,
    uiType: input.uiType ?? null,
    group: input.group ?? null,
    instrumentId: input.instrumentId ?? null,
    metal: input.metal ?? null,
    metalKind: input.metalKind ?? null,
    unitOfMeasure: input.unitOfMeasure ?? null,
    premiumPct: input.premiumPct ?? null,
    // Show the ticker immediately (selected instrument symbol or the manual ticker);
    // the list refetch later confirms it from the server (COALESCE join).
    symbol: input.symbol ?? input.manualTicker ?? null,
    instrumentProvider: null,
    isCustom: !input.instrumentId,
    isDelisted: false,
    quantity: input.quantity ?? "1",
    buyPriceCents:
      input.buyPriceCents != null ? String(input.buyPriceCents) : null,
    buyCurrency: input.buyCurrency ?? null,
    currentPriceCents:
      input.currentPriceCents != null ? String(input.currentPriceCents) : null,
    currentPriceCurrency: input.currentPriceCurrency ?? null,
    // Optimistic row: the real fetch time arrives with the list refetch.
    priceFetchedAt: null,
    valueCents,
    valueInBudgetCents: valueCents,
    profitLossPct: null,
    profitLossCents: null,
    weightPct: 0,
    sortOrder: 9999,
    createdAt: new Date().toISOString(),
  };
}

export function useCreateHolding(budgetId: string) {
  const qc = useQueryClient();
  const t = useTranslations("budget.investments.toast");
  const offlineToast = useOfflineWriteToast();
  const key = ["budget", budgetId, "investments"] as const;

  return useMutation({
    mutationFn: async (input: CreateHoldingInput) => {
      const res = await clientApiWrite(`/budgets/${budgetId}/investments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": generateIdempotencyKey(),
        },
        body: JSON.stringify(input),
      });
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
      qc.setQueryData<HoldingDto[]>(key, (old) => [
        ...(old ?? []),
        optimisticRow(input),
      ]);
      // Write-through: make the optimistic row durable in IDB NOW, before the
      // POST/any reload — the 800ms debounced persister otherwise leaves a window
      // where a reload restores the stale pre-add snapshot and the holding
      // "vanishes" (260621 persistence-guard flake). See persistNow().
      await persistNow(qc);
      return { previous };
    },

    onError: (err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      // Roll the durable cache back too, so a reload after a failed create does
      // not resurrect the rolled-back optimistic row.
      void persistNow(qc);
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(t("createFailed"));
    },

    onSuccess: () => toast.success(t("created")),

    onSettled: async () => {
      // Revalidate, then persist the server-reconciled list so the durable cache
      // holds the real (enriched) row rather than the optimistic placeholder.
      await qc.invalidateQueries({ queryKey: key });
      void persistNow(qc);
    },
  });
}
