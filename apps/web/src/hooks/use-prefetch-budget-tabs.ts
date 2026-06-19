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
import { mapTxnRowToDTO } from "@/hooks/use-transactions";

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
        // SPENDINGS rows (260617) — the grid's transactions + drafts. Without
        // these the grid renders (summary/categories cached) but the per-category
        // rows fetch on first visit and are empty offline. Shapes match
        // useTransactions/useDrafts verbatim (same endpoint + mapTxnRowToDTO).
        {
          key: ["transactions", budgetId, month],
          fn: () =>
            get(
              `/budgets/${budgetId}/transactions?month=${month}&confirmed=true`,
              (j) =>
                ((j as { transactions?: unknown[] }).transactions ?? []).map(
                  (r) =>
                    mapTxnRowToDTO(r as Parameters<typeof mapTxnRowToDTO>[0]),
                ),
            ),
        },
        {
          key: ["drafts", budgetId, month],
          fn: () =>
            get(
              `/budgets/${budgetId}/transactions?month=${month}&confirmed=false`,
              (j) =>
                ((j as { transactions?: unknown[] }).transactions ?? []).map(
                  (r) => {
                    const row = r as Parameters<typeof mapTxnRowToDTO>[0] & {
                      rule_name?: string;
                    };
                    return {
                      ...mapTxnRowToDTO(row),
                      ruleName: row.rule_name ?? "",
                    };
                  },
                ),
            ),
        },
        // SETTINGS-tab drivers (260617) — so the Settings tab is fully populated
        // offline (members were missing → empty in a shared budget). These keys
        // are now persisted too (query-persist.shouldPersist) so they survive a
        // reload offline. Shapes match each section's queryFn verbatim.
        {
          // members-section reads data.members → cache the WHOLE object.
          key: ["budget-members", budgetId],
          fn: () => get(`/budgets/${budgetId}/members`, (j) => j),
        },
        {
          key: ["cushion-summary", budgetId],
          fn: () => get(`/budgets/${budgetId}/cushion-summary`, (j) => j),
        },
        {
          key: ["recurring-rules", budgetId],
          fn: () =>
            get(
              `/budgets/${budgetId}/recurring-rules`,
              (j) => (j as { rules?: unknown[] }).rules ?? [],
            ),
        },
        {
          key: ["categories-lite", budgetId],
          fn: () =>
            get(
              `/budgets/${budgetId}/categories`,
              (j) => (j as { categories?: unknown[] }).categories ?? [],
            ),
        },
        // Notification settings (260618) — so the Settings → Notifications
        // section hydrates from cache like members. push-prefs caches the whole
        // {preferences:[...]} object (matches push-prefs-section's queryFn).
        {
          key: ["push-prefs", budgetId],
          fn: () => get(`/push/preferences?budgetId=${budgetId}`, (j) => j),
        },
        // push-subscription-status needs THIS device's push endpoint, so it
        // can't use the generic `get`. Mirrors push-prefs-section's queryFn.
        {
          key: ["push-subscription-status", budgetId],
          fn: async () => {
            try {
              const reg = await navigator.serviceWorker?.ready;
              const sub = await reg?.pushManager?.getSubscription?.();
              if (!sub) return { subscribed: false };
              const res = await clientApiFetch(
                `/push/subscription-status?budgetId=${budgetId}&endpoint=${encodeURIComponent(
                  sub.endpoint,
                )}`,
                {
                  signal: AbortSignal.timeout(8000),
                  headers: { "X-Budget-ID": budgetId },
                },
              );
              if (!res.ok) return { subscribed: false };
              return res.json();
            } catch {
              return { subscribed: false };
            }
          },
        },
      ];

    for (const { key, fn } of jobs) {
      if (qc.getQueryData(key)) continue; // already cached — leave it untouched.
      void qc.prefetchQuery({ queryKey: key, queryFn: fn, staleTime: 30_000 });
    }
  }, [budgetId, qc]);
}
