"use client";
/**
 * use-sell-holding.ts — POST /investments/:id/sell (Phase 13, D-01..D-04).
 *
 * One request, one server transaction. No optimistic rewrite: a sale touches
 * the source, maybe a destination, realized and history, so the lists are
 * refetched instead. Honest-offline via clientApiWrite (no queue).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiWrite } from "@/lib/offline-write";

export interface SellHoldingBody {
  effectiveDate: string;
  left: { quantity: string } | { valueCents: string };
  destination:
    | { kind: "new"; holding: Record<string, unknown> }
    | { kind: "existing"; holdingId: string; quantityBought?: string }
    | { kind: "out" };
  receivedCents: string;
  receivedCurrency: string;
}

/** Server refusal with its code (e.g. fx_unavailable + currency/date). */
export class SellError extends Error {
  constructor(
    public readonly code: string,
    public readonly currency?: string,
    public readonly date?: string,
  ) {
    super(code);
  }
}

export function useSellHolding(budgetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      holdingId,
      body,
    }: {
      holdingId: string;
      body: SellHoldingBody;
    }) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/investments/${holdingId}/sell`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          currency?: string;
          date?: string;
        };
        throw new SellError(j.error ?? "sell_failed", j.currency, j.date);
      }
      return (await res.json()) as {
        archived: boolean;
        newHoldingId: string | null;
      };
    },
    onSettled: () => {
      // Prefix match: holdings, type summary and every holding's history.
      void qc.invalidateQueries({ queryKey: ["budget", budgetId, "investments"] });
      void qc.invalidateQueries({ queryKey: ["budget", budgetId, "overview"] });
    },
  });
}
