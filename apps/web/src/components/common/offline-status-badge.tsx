"use client";
/**
 * OfflineStatusBadge — global offline indicator.
 *
 * Robust-minimal offline (260614-q1v): there is no offline write queue anymore,
 * so the badge is a plain connectivity pill:
 *   online  → hidden (aria-hidden)
 *   offline → red --destructive animate-pulse dot
 *
 * Connectivity is read from the browser online/offline events for the AMBIENT
 * pill only — it never gates writes (those are fetch-result-driven, because
 * navigator.onLine lies on iOS). Mount this once in the top nav.
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

  return (
    <span
      data-testid="offline-status-badge"
      aria-label={t("badge.ariaLabel")}
      className="relative inline-flex items-center"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--destructive,#ef4444)]"
      />
    </span>
  );
}
