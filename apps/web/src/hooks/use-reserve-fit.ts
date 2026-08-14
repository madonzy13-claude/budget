"use client";
/**
 * use-reserve-fit.ts — GET /budgets/:id/overview/reserve-fit (260804).
 *
 * "Is each category's reserve the right size?" — held against what the history
 * asked for. Lazy like its Overview siblings: only fetches while its section is
 * open, and the range is part of the key.
 *
 * The mutation saves a whole dialog's worth of "these were one-offs" for the
 * WHOLE budget, so it invalidates the chart rather than patching rows: several
 * categories can move at once, and the walk is cheap to recompute.
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
  /** 'YEARLY' etc. when the spend came from a scheduled rule — evidence it will
   *  come round again, so it should probably stay counted. */
  scheduled_cadence: string | null;
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
  /** What an average month ahead costs: the habit plus every recurring payment
   *  at its monthly rate. The Future chart measures today's limit against THIS,
   *  so the two figures it lists and the difference between them are one
   *  subtraction (260808). Optional: a payload cached before it existed replays
   *  without it, and the chart falls back to the observed mean. */
  projected_monthly_cents?: string | null;
  /** The limit that would keep this category solvent across the whole runway,
   *  and what moving to it costs or frees each month (260807). null = today's
   *  limit already is that limit. */
  suggested_limit_cents?: string | null;
  /** What the reserve would need AT the suggested limit — higher than
   *  `needed_cents` when the limit comes down, because a lower limit accrues
   *  less. The pair is what makes "lower it AND withdraw" safe (260807). */
  suggested_needed_cents?: string | null;
  suggested_delta_cents?: string | null;
  suggested_over_months?: number | null;
  suggested_direction?: "raise" | "lower" | null;
  overage_months: number;
  months_counted: number;
  large_transactions: ReserveFitTransaction[];
}

export interface ReserveFitDTO {
  currency: string;
  rows: ReserveFitRow[];
  /** What EVERY category costs in an average month, including the ones with no
   *  reserve row (opted out of the buffer, or untracked). The rows alone left
   *  those without a figure and the Future chart drew today's limit against
   *  itself (user, 260812). Optional: a payload cached before it existed
   *  replays without it. */
  projected_by_category?: {
    category_id: string;
    projected_monthly_cents: string;
  }[];
  /** Every large spend that could be set aside, from EVERY category — the rows
   *  carry only the buffered ones, so an opted-out category's spend was never
   *  offered (user, 260812). Optional: older cached payloads lack it. */
  one_off_candidates?: {
    ledger_id: string;
    category_id: string;
    category_name: string;
    transaction_date: string;
    note: string | null;
    amount_cents: string;
    scheduled_cadence: string | null;
    excluded: boolean;
  }[];
  /** Active scheduled rules with no category — real commitments that belong to
   *  no buffer, so they size nothing. Optional: a payload cached before the
   *  field existed replays without it. */
  unassigned_scheduled?: { name: string; amount_cents: string }[];
}

/**
 * Everything this budget's reserve-fit is cached under, whatever range is on
 * screen — and the ONLY thing a mutation should invalidate.
 *
 * Derived, not retyped: the invalidation used to spell the prefix out, and when
 * the query key was bumped to "-v2" the two drifted apart. React Query matches
 * prefixes element by element, so it silently matched nothing and a ticked-off
 * one-off stayed on the chart until the page was reloaded (user, 260810).
 */
export function reserveFitKeyPrefix(budgetId: string) {
  return ["budget", budgetId, "overview", "reserve-fit-v2"] as const;
}

export function reserveFitQueryKey(budgetId: string, from: string, to: string) {
  return [...reserveFitKeyPrefix(budgetId), from, to] as const;
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

/**
 * The dialog's own list, whatever range or category filter is on it. Ticking a
 * spend changes what that list says — which row is set aside, how many are —
 * and the list is a separate query from the chart since it started paging
 * (260813). Invalidating only the chart left a reopened dialog showing the old
 * answer and a badge counting none of the new ticks (user).
 */
export function oneOffsKeyPrefix(budgetId: string) {
  return ["budget", budgetId, "one-offs"] as const;
}

export function useSaveReserveFitExclusions(budgetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { add: string[]; remove: string[] }) => {
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
      void qc.invalidateQueries({ queryKey: reserveFitKeyPrefix(budgetId) });
      void qc.invalidateQueries({ queryKey: oneOffsKeyPrefix(budgetId) });
    },
  });
}

/**
 * categoryId → what an average month ahead costs, in cents.
 *
 * Prefers the per-category list, which covers every category; falls back to the
 * reserve ROWS, which only exist for categories the buffer tracks — that gap is
 * what made a reserve-excluded category read "expected = current limit"
 * (user, 260812). A category with no figure is left out rather than guessed at.
 */
export function projectedMonthlyMap(
  data:
    | {
        projected_by_category?: {
          category_id: string;
          projected_monthly_cents: string;
        }[];
        rows?: {
          category_id: string;
          projected_monthly_cents?: string | null;
        }[];
      }
    | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of data?.rows ?? []) {
    if (r.projected_monthly_cents == null) continue;
    out.set(r.category_id, Number(r.projected_monthly_cents));
  }
  for (const p of data?.projected_by_category ?? []) {
    out.set(p.category_id, Number(p.projected_monthly_cents));
  }
  return out;
}
