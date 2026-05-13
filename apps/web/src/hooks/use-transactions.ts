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

interface TxnRowSnake {
  id: string;
  category_id: string;
  amount_converted_cents: string | number;
  currency_converted?: string;
  currency_original?: string;
  amount_original_cents?: string | number;
  fx_rate?: string;
  fx_as_of?: string;
  note?: string | null;
  date?: string;
  transaction_date?: string;
  confirmed_at: string | null;
  rule_name?: string;
}

export function mapTxnRowToDTO(row: TxnRowSnake): TxnDTO {
  return {
    id: row.id,
    categoryId: row.category_id,
    amountConvertedCents: String(row.amount_converted_cents),
    currencyConverted: row.currency_converted ?? row.currency_original ?? "EUR",
    amountOriginalCents:
      row.amount_original_cents != null
        ? String(row.amount_original_cents)
        : undefined,
    currencyOriginal: row.currency_original,
    fxRate: row.fx_rate,
    fxAsOf: row.fx_as_of,
    note: row.note ?? null,
    transactionDate: row.transaction_date ?? row.date ?? "",
    confirmedAt: row.confirmed_at,
  };
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
      const body = (await res.json()) as { transactions?: TxnRowSnake[] };
      return (body.transactions ?? []).map(mapTxnRowToDTO);
    },
    staleTime: 30_000,
  });
}
