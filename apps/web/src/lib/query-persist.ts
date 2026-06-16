/**
 * query-persist.ts — stale-while-revalidate persistence for React Query
 * (260615-e8s round 8). Persists the budget-scoped query cache to IndexedDB so a
 * cold load / hard reload renders the LAST data INSTANTLY (hydrated from IDB,
 * ~one read) while a background refetch replaces it — zero waiting where cache
 * exists. Uses `dehydrate`/`hydrate` from @tanstack/react-query core + idb (no
 * extra deps, no react-query-persist-client package).
 *
 * Tenant safety: the cache is per-browser. It is cleared on logout via
 * clearQueryCache() (called alongside wipeBudgetCache).
 */
import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "budget-rqcache";
const STORE = "cache";
const KEY = "dehydrated";
// Bump to invalidate persisted shape across deploys that change query data.
const VERSION = "v1";
// Drop persisted snapshots older than this (defensive staleness bound).
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/** Persist only budget-scoped queries — never auth/settings or unrelated keys. */
function shouldPersist(queryKey: readonly unknown[]): boolean {
  const k0 = queryKey[0];
  return (
    k0 === "budget" ||
    k0 === "transactions" ||
    k0 === "spendings-summary" ||
    k0 === "reserves" ||
    k0 === "tasks" ||
    k0 === "active-budgets" ||
    k0 === "home-summary"
  );
}

async function openCacheDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
}

/** Restore the persisted query cache into the client (call once, on mount). */
export async function restoreQueryCache(client: QueryClient): Promise<void> {
  try {
    const db = await openCacheDb();
    const saved = (await db.get(STORE, KEY)) as
      | { v: string; at: number; state: unknown }
      | undefined;
    db.close();
    if (
      saved &&
      saved.v === VERSION &&
      saved.state &&
      Date.now() - saved.at < MAX_AGE_MS
    ) {
      hydrate(client, saved.state);
    }
  } catch {
    // IDB unavailable (private browsing) — skip persistence silently.
  }
}

/** Start persisting the cache to IDB on every change (debounced). Returns an
 * unsubscribe. */
export function startPersisting(client: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const write = async () => {
    try {
      const state = dehydrate(client, {
        shouldDehydrateQuery: (q) =>
          q.state.status === "success" && shouldPersist(q.queryKey),
      });
      const db = await openCacheDb();
      await db.put(STORE, { v: VERSION, at: Date.now(), state }, KEY);
      db.close();
    } catch {
      // best-effort
    }
  };
  const unsub = client.getQueryCache().subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, 800); // debounce bursts of updates
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}

/** Clear the persisted cache (tenant safety — call on logout). */
export async function clearQueryCache(): Promise<void> {
  try {
    const db = await openCacheDb();
    await db.delete(STORE, KEY);
    db.close();
  } catch {
    // ignore
  }
}
