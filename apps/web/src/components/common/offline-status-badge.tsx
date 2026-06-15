"use client";
/**
 * OfflineStatusBadge — header offline indicator (260615-bse redesign).
 *
 * App-shell offline nav: mounted INSIDE the TopNav header (right cluster), the
 * badge is a small inline control with ZERO added vertical height so toggling
 * online↔offline causes no layout shift:
 *   online  → sr-only / aria-hidden (zero footprint)
 *   offline → inline-flex h-6 pill: a PULSING lucide Globe (red --destructive)
 *             with a tooltip showing how stale the cached data is, e.g.
 *             "No internet — showing data from 13 minutes ago".
 *
 * Cache age: reuses staleness-marker.tsx's pattern — useFormatter().relativeTime
 * over getSyncMeta(budgetId).lastSyncedAt, ticked every 30s while offline. A
 * null budgetId or missing sync-meta falls back to indicator.tooltipUnknown.
 *
 * CONTROLLED tooltip — WHY: Radix Tooltip opens on hover/focus ONLY; it has NO
 * native tap-to-open, so on touch devices the tooltip would be unreachable.
 * We drive an explicit `open` state: Radix still toggles it on hover/focus via
 * onOpenChange (desktop), and an onClick on the trigger toggles it (mobile tap).
 *
 * Connectivity is read from the browser online/offline events + navigator.onLine
 * seed for the AMBIENT indicator only — it NEVER gates writes (those are
 * fetch-result/Promise.race-driven, because navigator.onLine lies on iOS). The
 * write fast-negative in use-create-transaction.ts is a separate concern.
 */
import { useState, useEffect } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Globe } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { getSyncMeta } from "@/lib/offline-cache";

export function OfflineStatusBadge({ budgetId }: { budgetId: string | null }) {
  const t = useTranslations("offline");
  const fmt = useFormatter();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [open, setOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
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

  // Load the last-synced timestamp from IndexedDB (cache-age source). Guard a
  // null budgetId → no lookup → tooltipUnknown branch.
  useEffect(() => {
    if (!budgetId) {
      setLastSyncedAt(null);
      return;
    }
    getSyncMeta(budgetId)
      .then((iso) => {
        if (iso) setLastSyncedAt(new Date(iso));
      })
      .catch(() => {
        // IndexedDB unavailable (e.g. private browsing) — silently ignore.
      });
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

  // Compact inline control — pulsing globe only. h-6 + shrink-0 so it sits
  // inside the 64px header with NO extra height (no layout shift vs the
  // sr-only online state) and never crowds the avatar.
  return (
    <span
      data-testid="offline-status-badge"
      className="inline-flex h-6 shrink-0 items-center"
    >
      <TooltipProvider>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("indicator.ariaLabel")}
              // Mobile tap: Radix has no native tap-to-open, so toggle the
              // controlled state explicitly. Desktop hover/focus is still
              // driven by Radix via onOpenChange.
              onClick={() => setOpen((o) => !o)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--destructive,#ef4444)] [-webkit-tap-highlight-color:transparent] focus:outline-none"
            >
              <Globe
                data-testid="offline-globe"
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-pulse"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>{tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}
