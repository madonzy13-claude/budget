/**
 * query-persist.ts — stale-while-revalidate persistence for React Query
 * (260615-e8s round 8). Persists the budget-scoped query cache to IndexedDB so a
 * cold load / hard reload renders the LAST data INSTANTLY (hydrated from IDB,
 * ~one read) while a background refetch replaces it — zero waiting where cache
 * exists. Uses `dehydrate`/`hydrate` from @tanstack/react-query core + idb (no
 * extra deps, no react-query-persist-client package).
 *
 * Tenant safety: the cache is per-browser. It is cleared on logout via
 * clearQueryCache() (called alongside dropLegacyBudgetCache).
 */
import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import { openDB, deleteDB, type IDBPDatabase } from "idb";

const DB_NAME = "budget-rqcache";
// The old bespoke offline-cache IDB (lib/offline-cache.ts, REMOVED in the SPA
// refactor 260616). Dropped on startup + logout so its stale per-tenant rows
// never linger on a shared device — the persisted React Query cache (this file)
// is now the single offline data source.
const LEGACY_DB_NAME = "budget-cache";
const STORE = "cache";
const KEY = "dehydrated";
// Bump to invalidate persisted shape across deploys that change query data.
const VERSION = "v1";
// Drop persisted snapshots older than this. Long-lived on purpose (260616): the
// offline cache must survive days/weeks without a reconnect — the user explicitly
// wants cached pages to keep rendering offline "forever". 1 year is the practical
// cap (well beyond any real offline stretch); the data still self-refreshes via
// SWR the moment the device is back online.
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365; // 1 year

/**
 * One-shot "the initial IDB cache restore has finished" flag (260620). Skeletons
 * use `reveal-delayed` (200ms invisible) ONLY to bridge this async restore so a
 * warm cache replaces the skeleton before it shows. The restore runs once, early.
 * AFTER it completes, any skeleton that mounts (e.g. a cold tab opened via a
 * client soft-nav) is genuinely waiting on the NETWORK (always >200ms), so the
 * 200ms-invisible window is pure downside — it just blanks the pane first. Cold
 * skeletons read this to render IMMEDIATELY once restore is done.
 *
 * Hydration-safe: restore runs in a QueryProvider effect (after hydration), so
 * this is `false` during SSR AND first client paint (no mismatch); it only flips
 * true later, gating mounts that happen after — none of which are SSR'd.
 */
let restoreComplete = false;
export function isRestoreComplete(): boolean {
  return restoreComplete;
}

/** Persist only budget-scoped queries — never auth or unrelated keys.
 *
 * 260617: the SETTINGS-tab drivers (budget-members, cushion-summary,
 * recurring-rules, categories-lite) were MISSING here, so they were never
 * written to IndexedDB → after ANY reload offline they vanished and the Settings
 * tab rendered empty / black ("cache disappears after reload" device report).
 * They are per-budget read data (tenant-scoped server-side by RLS), safe to
 * persist alongside the other budget keys. */
function shouldPersist(queryKey: readonly unknown[]): boolean {
  const k0 = queryKey[0];
  return (
    k0 === "budget" ||
    k0 === "transactions" ||
    k0 === "spendings-summary" ||
    k0 === "drafts" ||
    k0 === "reserves" ||
    k0 === "tasks" ||
    k0 === "active-budgets" ||
    k0 === "home-summary" ||
    // Settings-tab drivers (offline-complete Settings).
    k0 === "budget-members" ||
    k0 === "cushion-summary" ||
    k0 === "recurring-rules" ||
    k0 === "incomes" ||
    k0 === "categories-lite" ||
    // Notification settings — cache the master (per-budget subscription) + the
    // per-kind toggles so the Notifications section hydrates from cache like the
    // rest of Settings (260618).
    k0 === "push-prefs" ||
    k0 === "push-subscription-status"
  );
}

/**
 * Ask the browser to make this origin's storage PERSISTENT so the OS/engine
 * won't evict our IndexedDB cache + the SW Cache Storage under pressure or after
 * inactivity. WebKit (iOS Safari / installed PWAs) caps non-persistent storage
 * and evicts it well before our 1-year MAX_AGE — the "cache vanished even though
 * it should last a year" device report (260619). `persist()` flips the bucket to
 * best-effort durable; for an installed PWA iOS usually grants it silently.
 * Idempotent + best-effort: never throws, safe to call on every startup.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (
      typeof navigator === "undefined" ||
      !navigator.storage?.persist ||
      !navigator.storage.persisted
    ) {
      return false;
    }
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Delete the removed legacy offline-cache IDB (tenant safety + cleanup). */
export async function dropLegacyBudgetCache(): Promise<void> {
  try {
    await deleteDB(LEGACY_DB_NAME);
  } catch {
    // IDB unavailable / already gone — ignore.
  }
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
  // Best-effort cleanup of the removed legacy offline-cache IDB on startup.
  void dropLegacyBudgetCache();
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
  } finally {
    // Restore attempt done (data found or not): later cold skeletons can stop
    // waiting on the (now-finished) restore and render immediately.
    restoreComplete = true;
  }
}

/** Dehydrate the budget-scoped cache and write it to IDB once. Shared by the
 * debounced subscriber and the immediate `persistNow` write-through. */
async function writeCache(client: QueryClient): Promise<void> {
  try {
    const state = dehydrate(client, {
      // Persist any budget-scoped query that HAS DATA — not only status ===
      // "success" (260616). CRITICAL: on iOS navigator.onLine lies true while
      // offline, so refetchOnMount fires, the fetch hangs, AbortSignal.timeout
      // flips the query to status "error" (its data still in memory). The old
      // success-only filter then DROPPED that query on the next persist →
      // poisoned the cache → the next reload restored nothing → blank pages.
      // Keeping any data-bearing query means a transient offline error never
      // wipes the last-good cached data.
      shouldDehydrateQuery: (q) =>
        q.state.data !== undefined && shouldPersist(q.queryKey),
    });
    const db = await openCacheDb();
    await db.put(STORE, { v: VERSION, at: Date.now(), state }, KEY);
    db.close();
  } catch {
    // best-effort
  }
}

/**
 * Persist the cache to IDB IMMEDIATELY (no 800ms debounce). Write-through for
 * optimistic mutations whose durability must survive a reload that races the
 * debounced writer.
 *
 * The bug (260621): add a holding → optimistic onMutate writes the row to the
 * in-memory cache, but the debounced persister waits 800ms. A reload inside that
 * window restored the PRE-add snapshot (stale-empty), and with staleTime:30s the
 * query treated that empty list as fresh and never revalidated → the just-added
 * holding "vanished" (~50% in the persistence-guard E2E). Awaiting persistNow in
 * onMutate makes the optimistic row durable before the write can be reloaded over.
 *
 * Best-effort + safe to await; never throws.
 */
export async function persistNow(client: QueryClient): Promise<void> {
  await writeCache(client);
}

/** Start persisting the cache to IDB on every change (debounced). Returns an
 * unsubscribe. */
export function startPersisting(client: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = client.getQueryCache().subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void writeCache(client), 800); // debounce bursts
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
