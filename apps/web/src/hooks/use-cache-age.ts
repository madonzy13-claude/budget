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
 * The most recent successful budget-scoped query's `dataUpdatedAt`, as a Date,
 * or null if nothing has fetched yet. Recomputes on every query-cache change.
 */
export function useCacheAge(): Date | null {
  const qc = useQueryClient();
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    const compute = () => {
      let max = 0;
      for (const q of qc.getQueryCache().getAll()) {
        if (q.state.status !== "success") continue;
        if (!BUDGET_QUERY_ROOTS.has(q.queryKey[0] as string)) continue;
        if (q.state.dataUpdatedAt > max) max = q.state.dataUpdatedAt;
      }
      setLastSyncedAt((prev) => {
        const next = max ? new Date(max) : null;
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
