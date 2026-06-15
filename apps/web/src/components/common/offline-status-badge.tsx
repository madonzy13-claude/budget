"use client";
/**
 * OfflineStatusBadge — header offline indicator (260615-bse redesign).
 *
 * App-shell offline nav: mounted INSIDE the TopNav header (right cluster), the
 * badge is a small inline control with ZERO added vertical height so toggling
 * online↔offline causes no layout shift:
 *   online  → sr-only / aria-hidden (zero footprint)
 *   offline → inline-flex h-6 pill: a PULSING lucide Unplug (red --destructive)
 *             with a tooltip showing how stale the cached data is, e.g.
 *             "No internet — showing data from 13 minutes ago".
 *
 * No false flash (260615-d76): isOnline INITS true (SSR/first-paint renders
 * nothing). On reload navigator.onLine is briefly false during load, so we read
 * the REAL value only in a post-mount effect — the indicator appears only after
 * a confirmed post-mount navigator.onLine===false OR an 'offline' event, never
 * a hydration flash when actually online.
 *
 * Cache age: reuses staleness-marker.tsx's pattern — useFormatter().relativeTime
 * over the cache-age fallback chain, ticked every 30s while offline. When
 * budgetId is null OR getSyncMeta(budgetId) is null we fall back to
 * getSyncMeta("__global__") (any cache write bumps it) and then
 * getMostRecentSyncMeta() — only indicator.tooltipUnknown if nothing ever synced.
 *
 * POPOVER (260615-e8s Task 2): Radix Tooltip has no native tap-to-open on touch
 * devices; its controlled-open + manual onClick toggle caused a reopen race on
 * the second tap (Radix calling onOpenChange(true) after the click closed it).
 * Replaced with Popover which has native tap-to-open/close — no onClick toggle
 * needed. Popover renders side=bottom. Content style matches old tooltip.
 *
 * Connectivity is read from the browser online/offline events + navigator.onLine
 * seed for the AMBIENT indicator only — it NEVER gates writes (those are
 * fetch-result/Promise.race-driven, because navigator.onLine lies on iOS). The
 * write fast-negative in use-create-transaction.ts is a separate concern.
 */
import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Unplug } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { getSyncMeta, getMostRecentSyncMeta } from "@/lib/offline-cache";

export function OfflineStatusBadge({ budgetId }: { budgetId: string | null }) {
  const t = useTranslations("offline");
  const fmt = useFormatter();
  // Fix 1: init TRUE (assume online). On reload navigator.onLine is briefly
  // false during load — reading it synchronously here flashes the indicator
  // even when online. We read the REAL value only post-mount (below).
  const [isOnline, setIsOnline] = useState(true);
  const [open, setOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Post-mount: NOW read the real connectivity. By this point the page has
    // loaded so navigator.onLine is trustworthy — no hydration flash.
    setIsOnline(navigator.onLine);
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load the last-synced timestamp from IndexedDB (cache-age source). Fix 3:
  // fallback chain so the budget-list/home route (budgetId null) still shows a
  // real age: per-budget → "__global__" (any cache write bumps it) →
  // most-recent across all rows. tooltipUnknown only if nothing ever synced.
  useEffect(() => {
    let cancelled = false;
    async function resolveAge() {
      try {
        let iso: string | null = budgetId ? await getSyncMeta(budgetId) : null;
        if (!iso) iso = await getSyncMeta("__global__");
        if (!iso) iso = await getMostRecentSyncMeta();
        if (!cancelled) setLastSyncedAt(iso ? new Date(iso) : null);
      } catch {
        // IndexedDB unavailable (e.g. private browsing) — silently ignore.
      }
    }
    void resolveAge();
    return () => {
      cancelled = true;
    };
  }, [budgetId, isOnline]);

  // Tick every 30s to keep the relative cache age fresh while offline.
  useEffect(() => {
    if (isOnline) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [isOnline]);

  if (isOnline) {
    return (
      <span
        data-testid="offline-status-badge"
        aria-hidden="true"
        className="sr-only"
      />
    );
  }

  const tooltipText =
    lastSyncedAt !== null
      ? t("indicator.tooltip", {
          relativeTime: fmt.relativeTime(lastSyncedAt, now),
        })
      : t("indicator.tooltipUnknown");

  // Compact inline control — pulsing crossed-cloud only. h-6 + shrink-0 so it
  // sits inside the 64px header with NO extra height (no layout shift vs the
  // sr-only online state) and never crowds the avatar.
  return (
    <span
      data-testid="offline-status-badge"
      className="inline-flex h-6 shrink-0 items-center"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("indicator.ariaLabel")}
            // Popover owns tap-to-open/close natively — no manual onClick
            // toggle needed. This kills the controlled-open + onClick reopen
            // race that affected Radix Tooltip (Issue 1).
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--destructive,#ef4444)] [-webkit-tap-highlight-color:transparent] focus:outline-none"
          >
            <Unplug
              data-testid="offline-cloud-off"
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-pulse"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom">{tooltipText}</PopoverContent>
      </Popover>
    </span>
  );
}
