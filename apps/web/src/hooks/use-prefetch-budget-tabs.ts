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
import { backgroundApiFetch } from "@/lib/budget-fetch";
import { runPooled } from "@/lib/request-pool";
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
      const res = await backgroundApiFetch(path, {
        signal: AbortSignal.timeout(8000),
        headers: { "X-Budget-ID": budgetId },
      });
      if (!res.ok) throw new Error(`prefetch_failed:${path}`);
      return pick(await res.json());
    };

    type Job = { key: readonly unknown[]; fn: () => Promise<unknown> };

    // PRIORITY tier — drivers for the three tabs the user navigates among first
    // (Wallets / Spendings / Reserves) + budget detail. Queued FIRST so they get
    // the pool's slots ahead of the Settings drivers below.
    //
    // 260827: the tiers used to be a schedule — Settings waited for every
    // priority promise to settle, with a 4s fallback if one hung. That was the
    // only tool available for "don't fire 14 at once", and it cost a wait even
    // when the wire was free. request-pool caps concurrency instead, so order is
    // all these tiers still carry: everything is requested now, six at a time.
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
        // Wrapped explicitly: this job borrows the grid's own fetcher, which is
        // foreground code and rightly does not queue. Here it is warm-up like
        // everything else beside it, and outside the pool it was the one request
        // that could push the page to seven in flight.
        fn: () => runPooled(() => fetchSpendingsSummary(budgetId, month)),
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

    // SETTINGS tier — Settings is rarely the first pill, so these queue behind
    // the drivers above and take pool slots as those free. They still populate
    // the persisted cache so Settings renders instantly/offline once warm.
    const settingsJobs: Job[] = [
      {
        // The all-budgets page belongs to no single budget, so nothing else
        // warms it: open a budget, lose the network, tap through to the
        // switcher and the aggregate view had never been fetched (user,
        // 260806). Deferred, because it is not on the critical path of the
        // budget the member is actually looking at.
        key: ["budgets", "aggregate"],
        fn: async () => {
          const res = await backgroundApiFetch("/budgets/aggregate", {
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) throw new Error("prefetch_failed:/budgets/aggregate");
          return res.json();
        },
      },
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
        key: ["scheduled-payments", budgetId],
        fn: () =>
          get(
            `/budgets/${budgetId}/scheduled-payments`,
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
        // r33: investments settings toggle + slider read the whole {category,
        // hasIncome, exists} object.
        key: ["investment-category", budgetId],
        fn: () => get(`/budgets/${budgetId}/investment-category`, (j) => j),
      },
      {
        // settings scheduled-payments-section reads ["categories-lite"]. Same
        // data + shape as the priority ["budget", id, "categories"] fetch, so
        // REUSE it rather than asking twice.
        //
        // ensureQueryData, not getQueryData: this used to read the cache and
        // fall back to a fetch, which was safe only because the tier ran strictly
        // AFTER the priority one had resolved. Without that deferral the read can
        // land while categories is still in flight, and the fallback would fire a
        // second identical request. ensureQueryData hands back the in-flight
        // promise instead, so the two share one fetch however they interleave.
        key: ["categories-lite", budgetId],
        fn: () =>
          qc.ensureQueryData({
            queryKey: ["budget", budgetId, "categories"],
            queryFn: () =>
              get(
                `/budgets/${budgetId}/categories`,
                (j) => (j as { categories?: unknown[] }).categories ?? [],
              ),
          }),
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
            const res = await backgroundApiFetch(
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

    // Everything is asked for NOW; the pool decides how many travel at once, and
    // the order they were queued in is the order they get slots. Nothing waits
    // on a clock, so a hung job can no longer hold the rest back either — the
    // failure the 4s fallback timer existed to paper over.
    run([...priorityJobs, ...settingsJobs]);
  }, [budgetId, qc, userTz]);
}
