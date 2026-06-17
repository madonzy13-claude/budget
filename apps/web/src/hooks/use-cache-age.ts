"use client";
/**
 * use-cache-age.ts — cache-age state for the offline staleness bar (260616/17).
 *
 * Returns a 3-state result for a SPECIFIC set of "primary" query keys — the data
 * that defines the CURRENT page (the caller derives them from the route):
 *   - { kind: "synced", at }  the page's primary data IS cached → "updated {at}"
 *   - { kind: "never" }       the page's primary data is NOT cached (never fetched
 *                             online) → "data never cached"
 *   - { kind: "unknown" }     no primary keys for this route (transient) → generic
 *
 * Why keyed, not "any observed query": on the Wallets tab the budget DETAIL query
 * is often cached (from the switcher / home) while the WALLETS list — the data
 * actually on screen — is not. Keying off the page's primary data avoids a
 * misleading "updated 2s ago" when the visible content is uncached (260617 bug).
 *
 * `dataUpdatedAt` is stamped only on a real network resolution (offline it holds
 * at the last online sync); initialData-only queries have dataUpdatedAt===0 and
 * are treated as "not cached".
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type CacheAge =
  | { kind: "synced"; at: Date }
  | { kind: "never" }
  | { kind: "unknown" };

function sameCacheAge(a: CacheAge, b: CacheAge): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "synced" && b.kind === "synced")
    return a.at.getTime() === b.at.getTime();
  return true;
}

/**
 * @param primaryKeys the query keys whose freshness defines the current page.
 *   Empty array → { kind: "unknown" } (no page-specific data to report).
 */
export function useCacheAge(
  primaryKeys: readonly (readonly unknown[])[],
): CacheAge {
  const qc = useQueryClient();
  // Stable dependency for the effect — the caller may rebuild the array each
  // render; its serialized form only changes on a real route/key change.
  const keyJson = JSON.stringify(primaryKeys);
  const [state, setState] = useState<CacheAge>({ kind: "unknown" });

  useEffect(() => {
    const keys = JSON.parse(keyJson) as (readonly unknown[])[];
    const compute = () => {
      if (keys.length === 0) {
        setState((prev) =>
          prev.kind === "unknown" ? prev : { kind: "unknown" },
        );
        return;
      }
      let oldest = Infinity;
      for (const key of keys) {
        // Exact-key lookups (canonical QueryClient APIs) — no prefix/filter
        // ambiguity. getQueryData returns the cached data for THIS exact key;
        // getQueryState carries dataUpdatedAt.
        const data = qc.getQueryData(key);
        const at = qc.getQueryState(key)?.dataUpdatedAt ?? 0;
        // Real cached data only: present data + a non-zero (real network) stamp.
        if (data !== undefined && at && at < oldest) oldest = at;
      }
      const next: CacheAge =
        oldest !== Infinity
          ? { kind: "synced", at: new Date(oldest) }
          : { kind: "never" };
      setState((prev) => (sameCacheAge(prev, next) ? prev : next));
    };
    compute();
    return qc.getQueryCache().subscribe(compute);
  }, [qc, keyJson]);

  return state;
}
