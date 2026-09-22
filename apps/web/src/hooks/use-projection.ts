"use client";
/**
 * use-projection.ts — TanStack Query hook for the Overview cash-flow projection.
 * queryKey: ["budget", budgetId, "projection", days]. Mirrors use-spendings-summary.
 *
 * The window is part of the KEY (260904): a payload cached for 100 days cannot
 * answer a question about 365, and prefix invalidation on
 * ["budget", id, "projection"] still reaches every window from the mutation
 * hooks that clear it.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import {
  DEFAULT_HORIZON_DAYS,
  MAX_HORIZON_DAYS,
} from "@/lib/projection-horizon";

export interface ProjectionDay {
  date: string;
  color: "green" | "yellow" | "red";
  available_cents: string;
  /** The terms of the day's arithmetic, which the tooltip reads out:
   *  available = opening + income − bill − planned_burn − pending + reserve_covered. */
  opening_cents: string;
  planned_burn_cents: string;
  /** Unanswered occurrences charged that day — the FIRST day only. Optional: a
   *  payload cached before this existed replays without it, and the term is
   *  simply absent from the block. */
  pending_cents?: string;
  reserve_covered_cents: string;
  income_cents: string;
  bill_cents: string;
  drew_reserve: { category_id: string; name: string; amount_cents: string }[];
  shortfall: { category_id: string; name: string; amount_cents: string }[];
}

export interface ProjectionDTO {
  currency: string;
  days: ProjectionDay[];
  income_points: { date: string; name: string; amount_cents: string }[];
  bill_points: {
    date: string;
    name: string;
    category_id: string | null;
    amount_cents: string;
  }[];
  /** Scheduled occurrences whose date passed with no confirmation. Their money
   *  already rides inside the daily planned spend, so they are informational —
   *  the tooltip shows them on today's cell. Optional: an offline cache written
   *  by an older build has no such field. */
  pending_points?: {
    date: string;
    name: string;
    category_id: string | null;
    amount_cents: string;
  }[];
  summary: {
    first_yellow_date: string | null;
    first_red_date: string | null;
    worst_shortfall_cents: string;
  };
  /**
   * What can leave the budget TODAY with every dip in the forecast window still
   * covered — the lowest point of a worst-case run (each month's plan spendable
   * the moment the month opens). Negative = you are short by that much. Optional:
   * an offline cache written by an older build has no such field.
   */
  safe_to_withdraw?: { cents: string; thinnest_date: string | null };
  /** What could be withdrawn if the window ended on each day — the running
   *  trough of the same pessimistic run, one entry per day. Lets the card's
   *  figures follow a dragging horizon out of the payload already in hand
   *  (260904k). Optional: a payload cached before it existed has none, and the
   *  caller then keeps the server's single figure. */
  safe_by_day?: string[];
  /** "Available to spend" card health (dot + surplus/deficit). `good` is null and
   *  `surplus_deficit_cents` is null when there is no upcoming income (grey dot,
   *  card falls back to its "upcoming" figure). */
  spend_health: {
    good: boolean | null;
    surplus_deficit_cents: string | null;
  };
}

export async function fetchProjection(
  budgetId: string,
  days: number = DEFAULT_HORIZON_DAYS,
): Promise<ProjectionDTO> {
  const res = await clientApiFetch(
    `/budgets/${budgetId}/overview/projection?days=${days}`,
  );
  if (!res.ok) throw new Error("projection_fetch_failed");
  return await res.json();
}

/**
 * @param days how far ahead to look. `null` means the member's stored pick has
 *   not landed yet, and the query stays idle rather than fetching a window
 *   nobody chose and swapping it a moment later.
 */
export function useProjection(budgetId: string, days?: number | null) {
  const window = days ?? DEFAULT_HORIZON_DAYS;
  return useQuery({
    queryKey: ["budget", budgetId, "projection", window] as const,
    queryFn: () => fetchProjection(budgetId, window),
    enabled: days !== null,
    // Dragging the horizon changes the key, and a key change normally empties
    // `data` — which would blank the strip mid-drag and bounce the card back to
    // its skeleton. Holding the previous window lets the band keep what it has
    // and fill forward as the longer one lands.
    placeholderData: keepPreviousData,
    // The projection depends on wallets, reserves, income, scheduled rules and
    // spend, changed from many surfaces (often other tabs). Cache-first but always
    // revalidate on return to the tab / focus so a budget change is reflected
    // without threading invalidation through every mutation. Mutation hooks also
    // invalidate ["budget", id, "projection"] for same-tab live updates.
    // 260904d: was 0, which made every return to a window already in hand fire
    // a fresh request — drag right, drag left, drag right, three requests for
    // days nobody's budget had changed in between. A minute is short enough that
    // a figure acted on is never a minute stale, and mutations still invalidate
    // ["budget", id, "projection"] outright.
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

/**
 * The WIDEST window, fetched once while the horizon panel is open.
 *
 * The projection runs forward, so a shorter window is a PREFIX of a longer one —
 * day 40 of a 730-day run is day 40 of a 100-day run, the same opening balance
 * carried through the same events. That makes one wide payload the answer to
 * every position of the slider, which is what turns dragging from a series of
 * requests into a slice. Opening the panel is the signal it will be wanted; the
 * band is drawn from it for as long as the panel stays open.
 *
 * Its key is the ordinary one for that window, so a member who actually COMMITS
 * to 730 shares this cache entry rather than fetching it twice.
 */
export function useMaxProjection(budgetId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["budget", budgetId, "projection", MAX_HORIZON_DAYS] as const,
    queryFn: () => fetchProjection(budgetId, MAX_HORIZON_DAYS),
    enabled,
    // Quieter than the committed window on purpose: this one is a drawing
    // surface for a gesture, not the figure anybody acts on. Re-opening the
    // panel inside the session must not re-pull it.
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
