"use client";
/**
 * use-one-off-candidates.ts — "which spend won't happen again", a page at a
 * time (user, 260813).
 *
 * queryKey: ["budget", id, "one-offs", from, to, category]. The dialog used to
 * be handed a shortlist computed inside the reserve-fit payload — five per
 * category, above a size bar — which hid most of a household's spending from a
 * decision they are entitled to make. This asks for the lot, ten at a time,
 * and the server pages it with a keyset cursor.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface OneOffCandidateDTO {
  ledger_id: string;
  category_id: string;
  transaction_date: string;
  note: string | null;
  amount_cents: string;
  scheduled_cadence: string | null;
  excluded: boolean;
}

export interface OneOffPageDTO {
  items: OneOffCandidateDTO[];
  next_cursor: string | null;
  /** Set aside across the whole range, counted server-side — the badge reads
   *  this rather than the loaded rows (user, 260813). */
  excluded_total: number;
}

export function useOneOffCandidates(
  budgetId: string,
  range: { from: string; to: string },
  categoryId: string | null,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: [
      "budget",
      budgetId,
      "one-offs",
      range.from,
      range.to,
      categoryId ?? "all",
    ] as const,
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<OneOffPageDTO> => {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      if (categoryId) qs.set("category", categoryId);
      if (pageParam) qs.set("cursor", pageParam);
      const res = await clientApiFetch(
        `/budgets/${budgetId}/overview/one-offs?${qs.toString()}`,
      );
      if (!res.ok) throw new Error("one_offs_fetch_failed");
      return (await res.json()) as OneOffPageDTO;
    },
    getNextPageParam: (last) => last.next_cursor,
  });
}
