"use client";
/**
 * OfflineStaleBar — full-width staleness banner mounted JUST BELOW the app
 * header (260615-e8s round 3). Replaces the in-header offline icon: when the
 * device is offline the real cached page is being shown, so a narrow full-width
 * red bar warns that the data may be stale and states how long ago it was last
 * synced.
 *
 *   online  → renders nothing (null) — zero footprint, no layout shift.
 *   offline → narrow full-width red bar:
 *             "You're offline — showing cached data, last synced {X}".
 *
 * Cache age uses the same fallback chain as the old badge: per-budget sync-meta
 * → "__global__" (any cache write bumps it) → most-recent across all rows.
 *
 * Adaptive refresh (staleTickDelay): the relative time re-renders at a cadence
 * matched to its magnitude — every second under a minute, every minute under an
 * hour, every hour beyond that. A self-scheduling setTimeout recomputes the
 * bucket each tick because the age grows while offline.
 *
 * Connectivity: navigator.onLine + online/offline events. isOnline INITS true so
 * SSR / first paint renders nothing (navigator.onLine is briefly false during a
 * reload); the real value is read in a post-mount effect — no hydration flash.
 * navigator.onLine===false is reliable on iOS; ===true is not, but the bar only
 * shows on false, so that asymmetry is safe.
 */
import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { getSyncMeta, getMostRecentSyncMeta } from "@/lib/offline-cache";

/**
 * Refresh cadence for the relative cache age, by current age:
 *   < 1 minute → every second
 *   < 1 hour   → every minute
 *   ≥ 1 hour   → every hour (covers < 1 day and ≥ 1 day)
 */
export function staleTickDelay(ageMs: number): number {
  if (ageMs < 60_000) return 1_000;
  if (ageMs < 3_600_000) return 60_000;
  return 3_600_000;
}

export function OfflineStaleBar({ budgetId }: { budgetId: string | null }) {
  const t = useTranslations("offline");
  const fmt = useFormatter();
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function resolveAge() {
      try {
        let iso: string | null = budgetId ? await getSyncMeta(budgetId) : null;
        if (!iso) iso = await getSyncMeta("__global__");
        if (!iso) iso = await getMostRecentSyncMeta();
        if (!cancelled) setLastSyncedAt(iso ? new Date(iso) : null);
      } catch {
        // IndexedDB unavailable (private browsing) — silently ignore.
      }
    }
    void resolveAge();
    return () => {
      cancelled = true;
    };
  }, [budgetId, isOnline]);

  // Adaptive self-scheduling tick: recompute the delay each fire as age grows.
  useEffect(() => {
    if (isOnline) return;
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const base = lastSyncedAt ? lastSyncedAt.getTime() : Date.now();
      const delay = staleTickDelay(Date.now() - base);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, delay);
    }
    schedule();
    return () => clearTimeout(timer);
  }, [isOnline, lastSyncedAt]);

  if (isOnline) return null;

  const message =
    lastSyncedAt !== null
      ? t("staleBar.message", {
          relativeTime: fmt.relativeTime(lastSyncedAt, now),
        })
      : t("staleBar.unknown");

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-stale-bar"
      className="w-full overflow-hidden text-ellipsis whitespace-nowrap bg-[var(--destructive,#ef4444)] px-4 py-1 text-center text-[11px] font-medium leading-tight text-white"
    >
      {message}
    </div>
  );
}
