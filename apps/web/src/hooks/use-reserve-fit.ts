"use client";
/**
 * use-reserve-fit.ts — GET /budgets/:id/overview/reserve-fit (260804).
 *
 * "Is each category's reserve the right size?" — held against what the history
 * asked for. Lazy like its Overview siblings: only fetches while its section is
 * open, and the range is part of the key.
 *
 * The mutation records "this spend was a one-off" for the WHOLE budget, so it
 * invalidates the chart rather than patching one row: another category can hold
 * the same transaction's month, and the walk is cheap to recompute.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { clientApiWrite } from "@/lib/offline-write";

export interface ReserveFitTransaction {
  ledger_id: string;
  transaction_date: string;
  note: string | null;
  amount_cents: string;
  /** 'YEARLY' etc. when the spend came from a recurring rule — evidence it will
   *  come round again, so it should probably stay counted. */
  recurring_cadence: string | null;
  excluded: boolean;
}

export interface ReserveFitRow {
  category_id: string;
  name: string;
  held_cents: string;
  needed_cents: string;
  /** held − needed. Negative = short, positive = trimmable. */
  gap_cents: string;
  worst_month: string | null;
  worst_overage_cents: string;
  overage_months: number;
  months_counted: number;
  large_transactions: ReserveFitTransaction[];
}

export interface ReserveFitDTO {
  currency: string;
  rows: ReserveFitRow[];
}

export function reserveFitQueryKey(budgetId: string, from: string, to: string) {
  return ["budget", budgetId, "overview", "reserve-fit", from, to] as const;
}

export function useReserveFit(
  budgetId: string,
  opts: { from: string; to: string; enabled: boolean },
) {
  const { from, to, enabled } = opts;
  return useQuery({
    queryKey: reserveFitQueryKey(budgetId, from, to),
    enabled,
    placeholderData: keepPreviousData,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/overview/reserve-fit?from=${from}&to=${to}`,
        { headers: { "X-Budget-ID": budgetId } },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as ReserveFitDTO;
    },
  });
}

export function useSetReserveFitExclusion(budgetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ledgerId: string; excluded: boolean }) => {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/reserve-fit/exclusions`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Budget-ID": budgetId,
          },
          body: JSON.stringify(input),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return true;
    },
    onSettled: () => {
      void qc.invalidateQueries({
        queryKey: ["budget", budgetId, "overview", "reserve-fit"],
      });
    },
  });
}
