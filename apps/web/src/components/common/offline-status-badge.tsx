"use client";
/**
 * OfflineStatusBadge — global offline/pending-sync indicator (PWAX-02)
 *
 * State table:
 *   online  && queue === 0 → hidden (aria-hidden)
 *   online  && queue  > 0 → yellow --primary dot (pending sync)
 *   offline              → red --destructive animate-pulse dot
 *
 * Mount this once in the top nav, next to the profile button.
 */
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { getOfflineQueue } from "@/lib/offline-queue";

const POLL_MS = 5_000; // refresh queue count every 5 s while tab is open

export function OfflineStatusBadge() {
  const t = useTranslations("sync");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [queueCount, setQueueCount] = useState(0);

  async function refreshQueue() {
    try {
      const items = await getOfflineQueue();
      setQueueCount(items.length);
    } catch {
      // IndexedDB not available (SSR guard)
    }
  }

  useEffect(() => {
    refreshQueue();

    function handleOnline() {
      setIsOnline(true);
      refreshQueue();
    }
    function handleOffline() {
      setIsOnline(false);
      refreshQueue();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const timer = setInterval(refreshQueue, POLL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(timer);
    };
  }, []);

  const hidden = isOnline && queueCount === 0;

  if (hidden) {
    return (
      <span
        data-testid="offline-status-badge"
        aria-hidden="true"
        className="sr-only"
      />
    );
  }

  const isOffline = !isOnline;

  return (
    <span
      data-testid="offline-status-badge"
      aria-label={t("badge.ariaLabel", { count: queueCount })}
      className="relative inline-flex items-center"
    >
      <span
        aria-hidden="true"
        className={[
          "h-2.5 w-2.5 rounded-full",
          isOffline
            ? "animate-pulse bg-[var(--destructive,#ef4444)]"
            : "bg-[var(--primary,#f0b90b)]",
        ].join(" ")}
      />
    </span>
  );
}
