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
import { useUserTimezone } from "@/components/common/user-timezone-provider";

export function usePrefetchBudgetTabs(budgetId: string) {
  const qc = useQueryClient();
  // Same tz as the spendings grid's default month so the prefetched summary/txn
  // keys match what the grid reads (r31 item 1).
  const userTz = useUserTimezone();
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const month = Temporal.Now.plainDateISO(userTz)
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

    type Job = { key: readonly unknown[]; fn: () => Promise<unknown> };

    // PRIORITY tier — drivers for the three tabs the user navigates among first
    // (Wallets / Spendings / Reserves) + budget detail. Fired IMMEDIATELY so the
    // first pill nav is cached + the RSC prefetch (bdp-tabs.tsx) isn't starved.
    // Keeping this burst small is the whole point: firing all 14 at once peaked
    // at ~16 concurrent requests and inflated each ~4x on the API (260ms → ~1s),
    // so the primary data + RSC didn't land until ~2s → cold/janky first click.
    const priorityJobs: Job[] = [
      // Phase 11: overview is the FIRST pill — warm its cards before tap (D-05).
      // Section endpoints (planned/overspent/wealth) stay lazy (collapsed by default).
      {
        key: ["budget", budgetId, "overview", "cards"],
        fn: () => get(`/budgets/${budgetId}/overview/cards`, (j) => j),
      },
      {
        key: ["budget", budgetId, "wallets"],
        fn: () =>
          get("/wallets", (j) => (j as { wallets?: unknown[] }).wallets ?? []),
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
      // SPENDINGS rows (260617) — the grid's transactions + drafts. Shapes match
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
    ];

    // DEFERRED tier — Settings-tab drivers. Settings is rarely the first pill, so
    // these run only AFTER the priority tab data has finished over the network
    // (see the deferral below) to keep them off the critical path. They still
    // populate the persisted cache so Settings renders instantly/offline once warm.
    const deferredJobs: Job[] = [
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
        // settings income-section reads ["incomes", budgetId].
        key: ["incomes", budgetId],
        fn: () =>
          get(
            `/budgets/${budgetId}/incomes`,
            (j) => (j as { incomes?: unknown[] }).incomes ?? [],
          ),
      },
      {
        // settings recurring-section reads ["categories-lite"]. Same data + shape
        // as the priority ["budget", id, "categories"] fetch — REUSE that cached
        // value (it has resolved by the time this idle tier runs) instead of
        // hitting /categories a second time. Falls back to a fetch only if the
        // priority job somehow hasn't populated it yet.
        key: ["categories-lite", budgetId],
        fn: async () =>
          qc.getQueryData(["budget", budgetId, "categories"]) ??
          get(
            `/budgets/${budgetId}/categories`,
            (j) => (j as { categories?: unknown[] }).categories ?? [],
          ),
      },
      // Notification settings — push-prefs caches the whole {preferences:[...]}.
      {
        key: ["push-prefs", budgetId],
        fn: () => get(`/push/preferences?budgetId=${budgetId}`, (j) => j),
      },
      // push-subscription-status needs THIS device's push endpoint, so it can't
      // use the generic `get`. Mirrors push-prefs-section's queryFn.
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

    const run = (jobs: Job[]): Promise<unknown>[] => {
      const ps: Promise<unknown>[] = [];
      for (const { key, fn } of jobs) {
        if (qc.getQueryData(key)) continue; // already cached — leave untouched.
        ps.push(
          qc.prefetchQuery({ queryKey: key, queryFn: fn, staleTime: 30_000 }),
        );
      }
      return ps;
    };

    const priorityPromises = run(priorityJobs);

    // Defer the Settings drivers until the priority tab data has finished loading
    // over the NETWORK. Do NOT use requestIdleCallback: these prefetches are
    // network-bound, so the main thread idles almost immediately while they're in
    // flight and rIC fires ~at once — recreating the 16-way thundering herd that
    // inflated every request ~4x. Chaining on the priority promises keeps Settings
    // strictly off the critical-path burst. The fallback timer guarantees Settings
    // still warms if a priority job hangs (each has an 8s abort) or the tab idles.
    let cancelled = false;
    let started = false;
    const runDeferredOnce = () => {
      if (cancelled || started) return;
      started = true;
      run(deferredJobs);
    };
    void Promise.allSettled(priorityPromises).then(runDeferredOnce);
    const timerId = setTimeout(runDeferredOnce, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [budgetId, qc, userTz]);
}
