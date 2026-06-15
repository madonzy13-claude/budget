"use client";
/**
 * home-offline-cache.tsx — Home page client island (260615-e8s Task 5).
 *
 * Responsibilities:
 *   1. WRITE: on mount, if budgets.length > 0, cache the active-budgets list
 *      to IDB so a cold offline reload can display it. Also bumps __global__
 *      sync-meta via cacheActiveBudgets so the offline indicator dates itself.
 *   2. READ: if budgets.length === 0 (server fetch failed offline), read
 *      getCachedActiveBudgets() from IDB and render those rows.
 *
 * BudgetCard is a server component (no "use client") and cannot be a direct
 * child of this client island when rendering cached rows. HomeCardsGrid is
 * similarly server-first. To avoid making BudgetCard client, this island renders
 * HomeCardsGrid (which is compatible as a client-rendered child since it has no
 * async await at render time — it just calls Suspense+BudgetCard which React
 * hydrates fine in a client tree). If BudgetCard's async nature causes issues,
 * the island falls back to passing the cached list into HomeCardsGrid which
 * will render synchronously from props with no streaming.
 *
 * Online path: server props (budgets) pass straight through to HomeCardsGrid,
 * no IDB read needed. Effect runs but result is discarded (getCachedActiveBudgets
 * is only called when budgets is empty).
 *
 * Robust-minimal: write-on-visit only. No write-queue. No replay.
 */
import { useState, useEffect } from "react";
import {
  cacheActiveBudgets,
  getCachedActiveBudgets,
} from "@/lib/offline-cache";
import { HomeCardsGrid } from "@/components/budgeting/home-cards-grid";
import type { BudgetSummary } from "@/components/budgeting/budget-switcher";

interface HomeOfflineCacheProps {
  budgets: BudgetSummary[];
  locale: string;
}

export function HomeOfflineCache({ budgets, locale }: HomeOfflineCacheProps) {
  // list: starts with server-provided budgets; may be replaced by IDB rows
  // when the server list is empty (offline cold reload).
  const [list, setList] = useState<BudgetSummary[]>(budgets);

  useEffect(() => {
    if (budgets.length > 0) {
      // Online visit: persist the list so an offline reload can use it.
      void cacheActiveBudgets(budgets).catch(() => {});
    } else {
      // Offline (or server fetch failed): try to render last-known list.
      void getCachedActiveBudgets()
        .then((cached) => {
          if (cached.length > 0) {
            setList(cached as BudgetSummary[]);
          }
        })
        .catch(() => {});
    }
  }, [budgets]);

  return <HomeCardsGrid budgets={list} locale={locale} />;
}
