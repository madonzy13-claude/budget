"use client";
/**
 * use-projection-horizon.ts — the forecast window this member picked, for one
 * budget.
 *
 * Deliberately NOT a context: the value lives in the member ui-prefs query
 * cache, which every caller already shares, so the timeline and the Overview
 * cards read the same number from the same place and a change in one repaints
 * the other. A provider around them would add a second source of truth for a
 * value that is already cached.
 *
 * `days` is null until the stored pick has landed. Callers gate their fetch on
 * it: asking for the default first would request a window nobody chose and then
 * swap it for theirs — a wasted request and a visible jump.
 */
import { useCallback } from "react";
import { useMemberUiPrefs } from "@/hooks/use-member-ui-prefs";
import { useConnectivity } from "@/components/common/connectivity-provider";
import {
  DEFAULT_HORIZON_DAYS,
  HORIZON_PREF_KEY,
  clampHorizonDays,
  decodeHorizonPref,
  encodeHorizonPref,
} from "@/lib/projection-horizon";

export function useProjectionHorizon(budgetId: string): {
  /** null while the stored pick is still on its way. */
  days: number | null;
  setDays: (days: number) => void;
  /** The link is down: one cached window cannot answer a question about
   *  another, so the control goes inert rather than lying. */
  locked: boolean;
} {
  const { prefs, isLoaded, save } = useMemberUiPrefs(budgetId);
  // Offline, a query that has never run is PAUSED — never success, never error
  // — so waiting on the stored pick waits for ever and the card stays blank
  // over data we already hold (the range pills' own trap, 260806).
  const { degraded } = useConnectivity();
  const settled = isLoaded || degraded;

  const days = settled
    ? (decodeHorizonPref(prefs[HORIZON_PREF_KEY]) ?? DEFAULT_HORIZON_DAYS)
    : null;

  const setDays = useCallback(
    (next: number) => {
      // save() paints the pick into the shared cache up front, which is what
      // moves BOTH the strip and the cards on the same render.
      void save(HORIZON_PREF_KEY, encodeHorizonPref(clampHorizonDays(next)));
    },
    [save],
  );

  return { days, setDays, locked: degraded };
}
