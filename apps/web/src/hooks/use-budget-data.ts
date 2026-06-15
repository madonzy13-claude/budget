"use client";
/**
 * use-budget-data.ts — Aggregating hook: budget + wallets + categories + txns (B4)
 *
 * Wraps the individual per-entity hooks and wires the offline cache write-path:
 * on every successful fetch of all four entities, cacheBudgetSnapshot() persists
 * the full snapshot to IndexedDB so offline reads hit and the D-05 staleness
 * marker has a real last-synced source.
 *
 * This hook does NOT replace existing per-entity hooks (use-wallets, use-transactions,
 * use-spendings-summary). It is used in BDP pages that need the full snapshot for
 * offline hydration. Each query still uses its own React Query key and staleTime.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { cacheBudgetSnapshot } from "./use-cache-on-fetch";
import { useWallets, type WalletDto } from "./use-wallets";
import { useTransactions, type TxnDTO } from "./use-transactions";
import {
  getCachedBudget,
  getCachedEntities,
  markSynced,
} from "@/lib/offline-cache";

export interface BudgetDto {
  id: string;
  name: string;
  currency: string;
  [key: string]: unknown;
}

export interface CategoryDto {
  id: string;
  name: string;
  [key: string]: unknown;
}

/**
 * Fetch the budget row itself.
 * queryKey: ["budget", budgetId, "detail"]
 */
export function useBudget(budgetId: string, initialData?: BudgetDto) {
  return useQuery({
    queryKey: ["budget", budgetId, "detail"] as const,
    initialData,
    queryFn: async (): Promise<BudgetDto> => {
      // OFFLINE FAST-PATH (260615-e8s round 7): see use-wallets.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const cached = await getCachedBudget(budgetId);
        if (cached) return cached as BudgetDto;
        throw new Error("offline_no_cache");
      }
      try {
        const res = await clientApiFetch(`/budgets/${budgetId}`, {
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) throw new Error("budget_fetch_failed");
        const json = await res.json();
        void markSynced(budgetId).catch(() => {});
        return json.budget ?? json;
      } catch (e) {
        const cached = await getCachedBudget(budgetId);
        if (cached) return cached as BudgetDto;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

/**
 * Fetch the categories list for a budget.
 * queryKey: ["budget", budgetId, "categories"]
 */
export function useCategories(budgetId: string, initialData?: CategoryDto[]) {
  return useQuery({
    queryKey: ["budget", budgetId, "categories"] as const,
    initialData,
    queryFn: async (): Promise<CategoryDto[]> => {
      // OFFLINE FAST-PATH (260615-e8s round 7): see use-wallets.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const cached = await getCachedEntities("categories");
        if (cached.length) return cached as CategoryDto[];
        throw new Error("offline_no_cache");
      }
      try {
        const res = await clientApiFetch(`/budgets/${budgetId}/categories`, {
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) throw new Error("categories_fetch_failed");
        const json = await res.json();
        void markSynced(budgetId).catch(() => {});
        return json.categories ?? [];
      } catch (e) {
        const cached = await getCachedEntities("categories");
        if (cached.length) return cached as CategoryDto[];
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export interface UseBudgetDataOptions {
  budgetId: string;
  month: string;
  initialBudget?: BudgetDto;
  initialWallets?: WalletDto[];
  initialCategories?: CategoryDto[];
  initialTransactions?: TxnDTO[];
}

/**
 * Aggregates budget + wallets + categories + current-month transactions.
 * On all-success, writes a full snapshot to the offline cache (B4).
 */
export function useBudgetData(options: UseBudgetDataOptions) {
  const { budgetId, month } = options;

  const budgetQuery = useBudget(budgetId, options.initialBudget);
  const walletsQuery = useWallets(budgetId, options.initialWallets);
  const categoriesQuery = useCategories(budgetId, options.initialCategories);
  const transactionsQuery = useTransactions(budgetId, month, {
    initialData: options.initialTransactions,
  });

  const allSuccess =
    budgetQuery.isSuccess &&
    walletsQuery.isSuccess &&
    categoriesQuery.isSuccess &&
    transactionsQuery.isSuccess;

  useEffect(() => {
    if (!allSuccess) return;

    const budget = budgetQuery.data;
    const wallets = walletsQuery.data;
    const categories = categoriesQuery.data;
    // Map TxnDTO to cache-storable shape with _cacheKey
    const transactions = (transactionsQuery.data ?? []).map((t) => ({
      ...t,
      _cacheKey: `${budgetId}:${month}:${t.id}`,
    }));

    cacheBudgetSnapshot({
      budgetId,
      budget: budget as Record<string, unknown>,
      wallets,
      categories,
      transactions,
      iso: new Date().toISOString(),
    }).catch(() => {
      // Cache write failure is non-fatal — do not surface to user
    });
  }, [allSuccess, budgetId, month]);

  return { budgetQuery, walletsQuery, categoriesQuery, transactionsQuery };
}
