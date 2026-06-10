"use client";
/**
 * use-drafts.ts — TanStack Query hook for pending draft transactions.
 *
 * queryKey: ["drafts", budgetId, month]
 * Distinct from useTransactions ["transactions", ...] — no key collision possible.
 *
 * Invalidated by: use-confirm-draft, use-dismiss-draft.
 * queryFn: GET /budgets/:budgetId/transactions?month=YYYY-MM&confirmed=false
 *
 * DraftDTO extends TxnDTO with ruleName (recurring_rule.name joined server-side).
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { mapTxnRowToDTO, type TxnDTO } from "./use-transactions";

export interface DraftDTO extends TxnDTO {
  ruleName: string;
}

interface DraftRowSnake {
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

export function useDrafts(
  budgetId: string,
  month: string,
  options?: { initialData?: DraftDTO[] },
) {
  return useQuery({
    queryKey: ["drafts", budgetId, month] as const,
    initialData: options?.initialData,
    queryFn: async (): Promise<DraftDTO[]> => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/transactions?month=${month}&confirmed=false`,
      );
      if (!res.ok) throw new Error("drafts_fetch_failed");
      const body = (await res.json()) as { transactions?: DraftRowSnake[] };
      return (body.transactions ?? []).map((row) => ({
        ...mapTxnRowToDTO(row),
        ruleName: row.rule_name ?? "",
      }));
    },
    staleTime: 30_000,
  });
}
