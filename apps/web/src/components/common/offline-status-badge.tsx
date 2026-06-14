"use client";
/**
 * OfflineStatusBadge — header offline indicator.
 *
 * App-shell offline nav (260614-rwt): mounted INSIDE the TopNav header (right
 * cluster), the badge is a small inline pill with ZERO added vertical height so
 * toggling online↔offline causes no layout shift:
 *   online  → sr-only / aria-hidden (zero footprint)
 *   offline → inline-flex pill: red --destructive animate-pulse dot + "Offline"
 *
 * Connectivity is read from the browser online/offline events + navigator.onLine
 * seed for the AMBIENT pill only — it NEVER gates writes (those are
 * fetch-result/Promise.race-driven, because navigator.onLine lies on iOS). The
 * write fast-negative in use-create-transaction.ts is a separate concern.
 */
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

export function OfflineStatusBadge() {
  const t = useTranslations("offline");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

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

  if (isOnline) {
    return (
      <span
        data-testid="offline-status-badge"
        aria-hidden="true"
        className="sr-only"
      />
    );
  }

  // Small inline pill — dot + label. inline-flex + low padding + tiny text so it
  // sits inside the existing 64px header bar with no extra height. No w-full
  // banner, no fixed h-* row → no layout shift when toggling from the sr-only
  // online state.
  return (
    <span
      data-testid="offline-status-badge"
      aria-label={t("badge.ariaLabel")}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--destructive,#ef4444)]/40 bg-[var(--destructive,#ef4444)]/10 px-2 py-0.5 text-[11px] font-semibold leading-none text-[var(--destructive,#ef4444)]"
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 animate-pulse rounded-full bg-[var(--destructive,#ef4444)]"
      />
      {t("badge.label")}
    </span>
  );
}
