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
import type { TxnDTO } from "./use-transactions";

export interface DraftDTO extends TxnDTO {
  ruleName: string;
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
      const body = await res.json();
      return (body.transactions ?? []) as DraftDTO[];
    },
    staleTime: 30_000,
  });
}
