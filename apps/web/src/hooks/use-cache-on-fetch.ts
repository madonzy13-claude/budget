"use client";
/**
 * use-cache-on-fetch.ts — Write fetched budget entities into the offline cache (B4)
 *
 * cacheBudgetSnapshot() is called from use-budget-data.ts on every successful
 * fetch. It writes the full snapshot (budget + wallets + categories + current-month
 * transactions) to IndexedDB so offline reads hit and the D-05 staleness marker
 * has a real last-synced source.
 *
 * Guard: a null/empty payload is a no-op — a fetch error must NOT overwrite a
 * previously valid cache entry (stale-but-present beats blank).
 */
import { setCachedEntities } from "@/lib/offline-cache";

export interface BudgetSnapshot {
  budgetId: string;
  budget: Record<string, unknown> | null | undefined;
  wallets: unknown[] | null | undefined;
  categories: unknown[] | null | undefined;
  transactions: unknown[] | null | undefined;
  iso: string | null | undefined;
}

/**
 * Persists a full budget snapshot into the IndexedDB cache stores.
 * Each populated field is written independently — a missing/null field is skipped.
 * setSyncMeta is only called when iso is provided AND at least one entity was written.
 */
export async function cacheBudgetSnapshot(
  snapshot: BudgetSnapshot,
): Promise<void> {
  const { budget, wallets, categories, transactions } = snapshot;

  // Entity caching only — NO sync-meta stamp. The cache age is owned by
  // markSynced (called only on a real network fetch), so caching a snapshot on
  // mount/success (which includes offline cache-sourced success) never resets
  // the "last updated" indicator. (260615-e8s round 5.)
  if (budget) {
    await setCachedEntities("budgets", [budget]);
  }
  if (wallets && wallets.length > 0) {
    await setCachedEntities("wallets", wallets);
  }
  if (categories && categories.length > 0) {
    await setCachedEntities("categories", categories);
  }
  if (transactions && transactions.length > 0) {
    await setCachedEntities("transactions", transactions);
  }
}
