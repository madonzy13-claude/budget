"use client";
/**
 * OfflineStaleBar — full-width staleness banner mounted JUST BELOW the app
 * header. Offline, the real cached page is shown, so a narrow red bar states how
 * fresh THAT page's data is — or that it isn't cached.
 *
 *   online  → null.
 *   offline →
 *     - synced  → "Offline — data updated {relativeTime}"
 *     - never   → "Offline — data never cached"  (this page's primary data was
 *                  never fetched online; 260617 — don't show a misleading global
 *                  "updated Xs ago" on an uncached page)
 *     - unknown → "Offline — showing cached data"
 *
 * Per-page scope (260617): we derive the CURRENT route's PRIMARY query key (the
 * data on screen) and ask useCacheAge about just that — not "any cached query",
 * which previously let a cached budget-detail mask an uncached wallets list.
 *
 * JUMP FIX (260617): offline in-app navigation is a hard document reload
 * (OfflineNavGuard), so this bar re-mounts on every offline tab switch. Reading
 * navigator.onLine in a post-PAINT useEffect made the bar appear one frame late,
 * pushing the pills down (visible jump). We read it in an isomorphic LAYOUT
 * effect: on the client it runs before paint, so the bar is in the first painted
 * frame offline — no reflow. (Server → useEffect, so no SSR warning.) isOnline
 * still INITS true so SSR/hydration render nothing (no mismatch); the layout
 * effect flips it pre-paint when offline.
 */
import { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { Temporal } from "temporal-polyfill";
import { useCacheAge } from "@/hooks/use-cache-age";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

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

/** The query key(s) whose freshness defines the current route's on-screen data. */
function usePrimaryKeys(budgetId: string | null): (readonly unknown[])[] {
  const pathname = usePathname() ?? "";
  const sp = useSearchParams();
  const monthRaw = sp?.get("month") ?? null;
  return useMemo(() => {
    const inBudget = /\/budgets\/[0-9a-fA-F-]{8,}/.test(pathname);
    if (inBudget && budgetId) {
      if (pathname.endsWith("/spendings")) {
        const month =
          monthRaw && /^\d{4}-\d{2}$/.test(monthRaw)
            ? monthRaw
            : Temporal.Now.plainDateISO("UTC").toPlainYearMonth().toString();
        return [["spendings-summary", budgetId, month]];
      }
      if (pathname.endsWith("/wallets"))
        return [["budget", budgetId, "wallets"]];
      if (pathname.endsWith("/reserves"))
        return [["budget", budgetId, "reserves"]];
      if (pathname.endsWith("/settings"))
        return [["budget", budgetId, "detail"]];
      return [];
    }
    // Home / non-budget routes → the budget list is the on-screen data.
    if (!inBudget) return [["active-budgets"]];
    return [];
  }, [pathname, budgetId, monthRaw]);
}

export function OfflineStaleBar({ budgetId }: { budgetId: string | null }) {
  const t = useTranslations("offline");
  const fmt = useFormatter();
  const [isOnline, setIsOnline] = useState(true);
  const age = useCacheAge(usePrimaryKeys(budgetId));
  const [now, setNow] = useState(() => new Date());

  // Pre-paint connectivity read (jump fix) + online/offline listeners.
  useIsoLayoutEffect(() => {
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

  // Adaptive self-scheduling tick: recompute the delay each fire as age grows.
  useEffect(() => {
    if (isOnline || age.kind !== "synced") return;
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      const base = age.kind === "synced" ? age.at.getTime() : Date.now();
      const delay = staleTickDelay(Date.now() - base);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, delay);
    }
    schedule();
    return () => clearTimeout(timer);
  }, [isOnline, age]);

  if (isOnline) return null;

  const message =
    age.kind === "synced"
      ? t("staleBar.message", { relativeTime: fmt.relativeTime(age.at, now) })
      : age.kind === "never"
        ? t("staleBar.never")
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
