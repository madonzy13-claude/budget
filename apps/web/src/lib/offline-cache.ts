/**
 * offline-cache.ts — IndexedDB-backed budget cache layer (PWAX-02)
 *
 * DB_VERSION = 2 (v2 dropped the offline-queue store — robust-minimal offline
 * 260614-q1v: offline writes roll back with a toast instead of queueing).
 * Store shapes:
 *   budgets        keyPath: "id"         — { id, name, currency, ... }
 *   wallets        keyPath: "id"         — { id, name, balanceCents, ... }
 *   categories     keyPath: "id"         — { id, name, budgetCents, ... }
 *   transactions   keyPath: "_cacheKey"  — "_cacheKey" = "budgetId:YYYY-MM:id"
 *   sync-meta      keyPath: "key"        — { key: budgetId, lastSyncedAt: ISO }
 *
 * Bump DB_VERSION whenever any store's shape changes — co-located here (Pitfall 2).
 *
 * No "use client" — pure browser API wrapper, no React, no framework imports.
 */
import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "budget-cache";
export const DB_VERSION = 2; // bump when any store shape changes

export async function openBudgetDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("budgets")) {
        db.createObjectStore("budgets", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("wallets")) {
        db.createObjectStore("wallets", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("transactions")) {
        // keyPath "_cacheKey" = "budgetId:YYYY-MM:id"
        db.createObjectStore("transactions", { keyPath: "_cacheKey" });
      }
      // v2: drop the legacy offline-queue store if upgrading from v1.
      if (db.objectStoreNames.contains("offline-queue")) {
        db.deleteObjectStore("offline-queue");
      }
      if (!db.objectStoreNames.contains("sync-meta")) {
        // { key: budgetId, lastSyncedAt: ISO }
        db.createObjectStore("sync-meta", { keyPath: "key" });
      }
    },
  });
}

export async function getCachedBudget(budgetId: string) {
  const db = await openBudgetDB();
  const result = (await db.get("budgets", budgetId)) ?? null;
  db.close();
  return result;
}

export async function setCachedEntities(
  store: "budgets" | "wallets" | "categories" | "transactions",
  items: unknown[],
): Promise<void> {
  if (!items.length) return;
  const db = await openBudgetDB();
  const tx = db.transaction(store, "readwrite");
  await Promise.all([...items.map((item) => tx.store.put(item)), tx.done]);
  db.close();
}

export async function setSyncMeta(
  budgetId: string,
  iso: string,
): Promise<void> {
  const db = await openBudgetDB();
  await db.put("sync-meta", { key: budgetId, lastSyncedAt: iso });
  db.close();
}

export async function getSyncMeta(budgetId: string): Promise<string | null> {
  const db = await openBudgetDB();
  const row = await db.get("sync-meta", budgetId);
  db.close();
  if (!row) return null;
  return (row as { key: string; lastSyncedAt: string }).lastSyncedAt ?? null;
}

/**
 * getMostRecentSyncMeta — newest lastSyncedAt across ALL sync-meta rows
 * (260615-d76). Used as the final cache-age fallback so the budget-list/home
 * route (budgetId null) shows a real "data from N ago" instead of "unknown"
 * after any online visit has populated the cache. Includes the "__global__"
 * row in the max scan. Returns null only when nothing has ever synced.
 */
export async function getMostRecentSyncMeta(): Promise<string | null> {
  const db = await openBudgetDB();
  const rows = (await db.getAll("sync-meta")) as Array<{
    key: string;
    lastSyncedAt?: string;
  }>;
  db.close();
  let newest: string | null = null;
  for (const row of rows) {
    const iso = row.lastSyncedAt;
    if (!iso) continue;
    if (newest === null || iso > newest) newest = iso;
  }
  return newest;
}

export async function wipeBudgetCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // proceed even if blocked in tests
  });
}
