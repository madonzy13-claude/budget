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

  // Compact inline pill — wifi-off icon + short label. shrink-0 so it never
  // collapses, h-6/tiny text so it sits inside the 64px header with no extra
  // height. Tight px so it never crowds the avatar; the switcher truncates to
  // make room. No w-full banner, no fixed h-* row → no layout shift toggling
  // from the sr-only online state.
  return (
    <span
      data-testid="offline-status-badge"
      aria-label={t("badge.ariaLabel")}
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-[var(--destructive,#ef4444)]/40 bg-[var(--destructive,#ef4444)]/10 px-1.5 text-[10px] font-semibold leading-none text-[var(--destructive,#ef4444)]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3 shrink-0 animate-pulse"
      >
        <path d="M2 2l20 20" />
        <path d="M8.5 16.5a5 5 0 0 1 7 0" />
        <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
        <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
        <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
        <path d="M5 13a10 10 0 0 1 5.24-2.76" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <span className="hidden sm:inline">{t("badge.label")}</span>
    </span>
  );
}
