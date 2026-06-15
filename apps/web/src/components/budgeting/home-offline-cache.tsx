"use client";
/**
 * home-offline-cache.tsx — Home page client island (260615-e8s Task 5).
 *
 * Single responsibility: persist the active-budgets list to IndexedDB via
 * cacheActiveBudgets (so a cold offline open can render the home list). It does
 * NOT stamp sync-meta — the cache age is owned by markSynced, called only on a
 * real network fetch, so mounting the home island never resets the "last
 * updated" indicator. It then renders {children} unchanged.
 *
 * Why children (not an imported grid): the real cards are rendered by the SERVER
 * component HomeCardsGrid → BudgetCard, and BudgetCard pulls in "server-only"
 * code (budget-fetch.server.ts / next/headers). A "use client" island MUST NOT
 * import that tree or the client bundle fails to compile. Passing the server grid
 * in as `children` is the canonical RSC pattern: the server renders it and React
 * hands it to this client island as an opaque slot — no server import crosses the
 * boundary.
 *
 * Offline render path: the SW nav-docs-v1 cache serves the last-online HTML of
 * `/` (which already contains the server-rendered cards), so there is no separate
 * client-side cached-list branch to maintain here. The page short-circuits to
 * HomeEmptyHero when the list is empty, so this island only ever sees a populated
 * list — its job is purely the write-on-visit side-effect.
 *
 * Robust-minimal: write-on-visit only. Best-effort, non-blocking. No write-queue,
 * no replay.
 */
import { useEffect } from "react";
import type { ReactNode } from "react";
import { cacheActiveBudgets } from "@/lib/offline-cache";
import type { BudgetSummary } from "@/components/budgeting/budget-switcher";

interface HomeOfflineCacheProps {
  budgets: BudgetSummary[];
  children: ReactNode;
}

export function HomeOfflineCache({ budgets, children }: HomeOfflineCacheProps) {
  useEffect(() => {
    if (budgets.length > 0) {
      // Online visit: persist the list (+ bump __global__ sync-meta) so a cold
      // offline reload dates the indicator. Best-effort; never blocks render.
      void cacheActiveBudgets(budgets).catch(() => {});
    }
  }, [budgets]);

  return <>{children}</>;
}
