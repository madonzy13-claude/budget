"use client";
/**
 * use-prefetch-budget-tabs.ts — warm EVERY budget tab's primary data into the
 * React Query cache when a budget is opened (260616).
 *
 * Why: the persisted query cache only holds data for pages the user actually
 * visited online, so reopening offline after only landing on Wallets left
 * Spendings / Reserves / Settings with no cached data → blank/dark tabs. Opening
 * any tab now background-prefetches the drivers for all four (wallets list,
 * reserves summary, categories, current-month spendings summary, budget detail),
 * which the persistence layer writes to IndexedDB → every tab renders offline.
 *
 * Cheap + safe: online only (offline it's a no-op — networkMode would pause it
 * anyway), skips anything already cached, and the shapes match each tab hook's
 * queryFn so a later visit reads the prefetched cache verbatim (then SWR-revals).
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Temporal } from "temporal-polyfill";
import { clientApiFetch } from "@/lib/budget-fetch";
import { fetchSpendingsSummary } from "@/hooks/use-spendings-summary";

export function usePrefetchBudgetTabs(budgetId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const month = Temporal.Now.plainDateISO("UTC")
      .toPlainYearMonth()
      .toString();

    const get = async (path: string, pick: (j: unknown) => unknown) => {
      const res = await clientApiFetch(path, {
        signal: AbortSignal.timeout(8000),
        headers: { "X-Budget-ID": budgetId },
      });
      if (!res.ok) throw new Error(`prefetch_failed:${path}`);
      return pick(await res.json());
    };

    const jobs: Array<{ key: readonly unknown[]; fn: () => Promise<unknown> }> =
      [
        {
          key: ["budget", budgetId, "wallets"],
          fn: () =>
            get(
              "/wallets",
              (j) => (j as { wallets?: unknown[] }).wallets ?? [],
            ),
        },
        {
          key: ["budget", budgetId, "reserves"],
          fn: () => get(`/budgets/${budgetId}/reserves`, (j) => j),
        },
        {
          key: ["budget", budgetId, "categories"],
          fn: () =>
            get(
              `/budgets/${budgetId}/categories`,
              (j) => (j as { categories?: unknown[] }).categories ?? [],
            ),
        },
        {
          key: ["budget", budgetId, "detail"],
          fn: () =>
            get(`/budgets/${budgetId}`, (j) => {
              const o = j as { budget?: unknown };
              return o.budget ?? j;
            }),
        },
        {
          key: ["spendings-summary", budgetId, month],
          fn: () => fetchSpendingsSummary(budgetId, month),
        },
      ];

    for (const { key, fn } of jobs) {
      if (qc.getQueryData(key)) continue; // already cached — leave it untouched.
      void qc.prefetchQuery({ queryKey: key, queryFn: fn, staleTime: 30_000 });
    }
  }, [budgetId, qc]);
}
