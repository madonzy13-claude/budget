"use client";
/**
 * use-cache-age.ts — "last synced" timestamp for the offline staleness bar,
 * derived from the React Query cache (SPA/SWR refactor 260616).
 *
 * Replaces the old offline-cache sync-meta store (getSyncMeta / __global__ /
 * most-recent fallback chain). Now that every budget-scoped read is a persisted
 * React Query query, the freshest successful query's `dataUpdatedAt` IS the last
 * successful network sync: it's stamped only on a real fetch resolution, and
 * offline the queries don't resolve (networkMode pauses / they fail), so it
 * holds steady at the last online fetch — exactly the "data updated X ago" the
 * stale bar wants. No IndexedDB, no separate sync-meta bookkeeping.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Budget-scoped query roots — mirror query-persist.ts shouldPersist so the age
// reflects the same data we persist/restore.
const BUDGET_QUERY_ROOTS = new Set([
  "budget",
  "transactions",
  "spendings-summary",
  "drafts",
  "reserves",
  "tasks",
  "active-budgets",
  "home-summary",
]);

/**
 * The "last synced" Date for the CURRENT page (260616, user request: the banner
 * should reflect the freshness of the data actually on screen — different pages
 * may hold older cache than others).
 *
 * We scope to the queries the current page is ACTIVELY observing (observer count
 * > 0) — when the user is on Spendings, only the spendings queries are mounted,
 * on Wallets only the wallet query, etc. Among those we take the OLDEST
 * `dataUpdatedAt` (min), so the banner shows the worst-case staleness of what the
 * user is looking at. If no budget-scoped query is currently observed (e.g. a
 * route between mounts), fall back to the most recent across all cached budget
 * queries so the bar still shows a sensible time instead of "unknown".
 */
export function useCacheAge(): Date | null {
  const qc = useQueryClient();
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    const compute = () => {
      let oldestActive = Infinity; // min dataUpdatedAt among observed queries
      let newestAny = 0; // fallback: max across all cached budget queries
      for (const q of qc.getQueryCache().getAll()) {
        if (!BUDGET_QUERY_ROOTS.has(q.queryKey[0] as string)) continue;
        if (q.state.data === undefined || !q.state.dataUpdatedAt) continue;
        const at = q.state.dataUpdatedAt;
        if (at > newestAny) newestAny = at;
        if (q.getObserversCount() > 0 && at < oldestActive) oldestActive = at;
      }
      const ms = oldestActive !== Infinity ? oldestActive : newestAny || 0;
      setLastSyncedAt((prev) => {
        const next = ms ? new Date(ms) : null;
        // Avoid a re-render when the timestamp is unchanged.
        if (prev?.getTime() === next?.getTime()) return prev;
        return next;
      });
    };
    compute();
    return qc.getQueryCache().subscribe(compute);
  }, [qc]);

  return lastSyncedAt;
}
