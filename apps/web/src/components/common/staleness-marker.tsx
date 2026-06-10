"use client";

/**
 * staleness-marker.tsx — "Last synced X ago" indicator (D-05).
 *
 * Shown when the app is offline or within 30 seconds of reconnecting,
 * so the user knows how fresh the cached data is. Hidden when the app
 * is online and data is fresh (no reconnect in the last 30 s).
 *
 * Reads lastSyncedAt from the sync-meta IndexedDB store via getSyncMeta()
 * (populated by the offline cache layer in 08-03).
 *
 * Accessibility: aria-live="polite" so screen readers announce changes
 * without interrupting the user mid-task.
 */

import { useEffect, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { getSyncMeta } from "@/lib/offline-cache";

interface StalenessMarkerProps {
  /** The budget ID to look up sync-meta for. */
  budgetId: string;
  /** Whether the app is currently offline. */
  isOffline: boolean;
  /**
   * When the app reconnected (set by the reconnect handler).
   * null = no reconnect event during this page lifecycle.
   * The marker stays visible for 30 s after reconnect so the user can
   * see "was synced X ago" before fresh data arrives.
   */
  reconnectedAt?: Date | null;
  className?: string;
}

const RECONNECT_VISIBLE_MS = 30_000;

export function StalenessMarker({
  budgetId,
  isOffline,
  reconnectedAt = null,
  className,
}: StalenessMarkerProps) {
  const t = useTranslations("sync");
  const fmt = useFormatter();
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Load the last-synced timestamp from IndexedDB
  useEffect(() => {
    getSyncMeta(budgetId)
      .then((iso) => {
        if (iso) setLastSyncedAt(new Date(iso));
      })
      .catch(() => {
        // IndexedDB unavailable (e.g. private browsing) — silently ignore
      });
  }, [budgetId, isOffline]);

  // Tick every 30 s to keep relative time fresh while offline
  useEffect(() => {
    if (!isOffline) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [isOffline]);

  // Determine visibility: show when offline, or within 30s of reconnect
  const withinReconnectWindow =
    reconnectedAt !== null &&
    now.getTime() - reconnectedAt.getTime() < RECONNECT_VISIBLE_MS;

  const visible = isOffline || withinReconnectWindow;

  if (!visible) {
    // Still render with aria-live so future updates are announced
    return (
      <span
        data-testid="staleness-marker"
        aria-live="polite"
        className="sr-only"
      />
    );
  }

  const relativeTime =
    lastSyncedAt !== null ? fmt.relativeTime(lastSyncedAt, now) : null;

  return (
    <span
      data-testid="staleness-marker"
      aria-live="polite"
      className={`inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] ${className ?? ""}`}
    >
      {relativeTime !== null
        ? t("staleness", { relativeTime })
        : t("staleness", { relativeTime: "—" })}
    </span>
  );
}
