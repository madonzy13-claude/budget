"use client";

/**
 * offline-fallback.tsx — Inline "unavailable offline" empty-state (D-04).
 *
 * Shown inside a page/panel when the data for that view has never been
 * fetched into the offline cache. The user is not redirected — they stay
 * on the page and see this empty-state with a retry button.
 *
 * Separate from offline.html (static SW fallback for navigation requests)
 * and server-down-card.tsx (API unreachable at session-check time).
 */

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

interface OfflineFallbackProps {
  /** Called when the user taps Retry. Default: window.location.reload(). */
  onRetry?: () => void;
  className?: string;
}

export function OfflineFallback({ onRetry, className }: OfflineFallbackProps) {
  const t = useTranslations("offline");

  function handleRetry() {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  }

  return (
    <div
      data-testid="offline-unavailable"
      className={`flex flex-col items-center justify-center gap-4 py-12 text-center ${className ?? ""}`}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10"
        aria-hidden="true"
      >
        <WifiOff className="h-7 w-7 text-[var(--primary)]" />
      </span>
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-[var(--body-on-dark)]">
          {t("unavailable.heading")}
        </h2>
        <p className="max-w-xs text-sm leading-relaxed text-[var(--muted-foreground)]">
          {t("unavailable.body")}
        </p>
      </div>
      <button
        type="button"
        onClick={handleRetry}
        className="mt-2 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--body-on-dark)] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      >
        {t("unavailable.retry")}
      </button>
    </div>
  );
}
