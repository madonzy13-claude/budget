"use client";
/**
 * use-transactions.ts — TanStack Query hook for confirmed transactions.
 *
 * queryKey: ["transactions", budgetId, month]
 * This exact key is used by all mutation hooks (create, update, delete, confirm-draft)
 * to invalidate and update the cache. Verbatim string match is REQUIRED.
 *
 * Hydrated from RSC initialData (Plan 04-04 spendings/page.tsx).
 * queryFn: GET /budgets/:budgetId/transactions?month=YYYY-MM&confirmed=true
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface TxnDTO {
  id: string;
  categoryId: string;
  amountConvertedCents: string;
  currencyConverted: string;
  amountOriginalCents?: string;
  currencyOriginal?: string;
  fxRate?: string;
  fxAsOf?: string;
  note?: string | null;
  transactionDate: string;
  confirmedAt: string | null;
  pending?: boolean;
  unsent?: boolean;
}

export function useTransactions(
  budgetId: string,
  month: string,
  options?: { initialData?: TxnDTO[] },
) {
  return useQuery({
    queryKey: ["transactions", budgetId, month] as const,
    initialData: options?.initialData,
    queryFn: async (): Promise<TxnDTO[]> => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/transactions?month=${month}&confirmed=true`,
      );
      if (!res.ok) throw new Error("transactions_fetch_failed");
      const body = await res.json();
      // Phase 2 transactions endpoint returns { transactions: TxnDTO[] }
      return (body.transactions ?? []) as TxnDTO[];
    },
    staleTime: 30_000,
  });
}
