"use client";
/**
 * SyncIssuesList — bottom-sheet list of failed sync items (PWAX-03)
 *
 * Reads getOfflineQueue() filtered to failReason !== undefined.
 * Each row shows the reason code and an enqueuedAt time.
 * Dismiss calls removeFromQueue + shows a sonner toast.
 *
 * Trigger (the Sheet open button) is hidden when there are no failures.
 */
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getOfflineQueue,
  removeFromQueue,
  OFFLINE_QUEUE_CHANGED_EVENT,
  type OfflineTxn,
} from "@/lib/offline-queue";

const POLL_MS = 5_000;

export function SyncIssuesList() {
  const t = useTranslations("sync");
  const [failed, setFailed] = useState<OfflineTxn[]>([]);

  async function refresh() {
    try {
      const all = await getOfflineQueue();
      setFailed(all.filter((item) => item.failReason !== undefined));
    } catch {
      // IndexedDB unavailable (SSR guard)
    }
  }

  useEffect(() => {
    refresh();
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refresh);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refresh);
      clearInterval(timer);
    };
  }, []);

  async function handleDismiss(key: string) {
    await removeFromQueue(key);
    toast.success(t("issues.dismissed"));
    await refresh();
  }

  return (
    <div data-testid="sync-issues-list" aria-live="polite">
      {failed.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="mb-1 text-sm font-semibold text-[var(--body-on-dark)]">
            {t("issues.title")}
          </h3>
          <p className="mb-3 text-xs text-[var(--muted-foreground)]">
            {t("issues.description")}
          </p>
          <ul role="list" className="space-y-2">
            {failed.map((item) => {
              const reasonKey = item.failReason as string;
              const reasonLabel =
                // Map known reason codes to i18n keys; fallback to UNKNOWN
                [
                  "VALIDATION_ERROR",
                  "ARCHIVED_CATEGORY",
                  "MONTH_ROLLED",
                ].includes(reasonKey)
                  ? t(`issues.reason.${reasonKey}` as Parameters<typeof t>[0])
                  : t("issues.reason.UNKNOWN");

              return (
                <li
                  key={item.idempotencyKey}
                  className="flex items-start gap-3 rounded-[var(--radius-sm)] bg-[var(--destructive,#ef4444)]/5 px-3 py-2"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--destructive,#ef4444)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[var(--body-on-dark)]">
                      {reasonLabel}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {t("issues.enqueuedAt", {
                        relativeTime: item.enqueuedAt,
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid={`dismiss-${item.idempotencyKey}`}
                    onClick={() => handleDismiss(item.idempotencyKey)}
                    className="flex-shrink-0 text-xs text-[var(--muted-foreground)] underline hover:text-[var(--body-on-dark)]"
                  >
                    {t("issues.dismiss")}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
