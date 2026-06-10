"use client";

/**
 * <ServerDownCard> — client island for /[locale]/server-down.
 *
 * Renders the localized "we can't reach the server" message + a Retry button.
 * Retry probes GET /api/health (proxied to the API container by next.config
 * rewrites). On 200 the page is hard-reloaded so middleware + RSCs re-run
 * from a clean state. On failure (timeout, 5xx, fetch reject) we surface an
 * inline `still_unreachable` message under the button and stay on this screen.
 *
 * Why inline (not a sonner toast): the Toaster is mounted inside the (app)
 * shell layout. /server-down deliberately lives OUTSIDE that shell so it
 * renders even when the auth layout cannot — which means there is no Toaster
 * to call into. An inline message also reads better when the screen is the
 * sole focus.
 *
 * No automatic polling. The user explicitly chooses when to retry. Auto-polling
 * was considered and rejected — it can keep the device awake and burn battery
 * on installed PWAs sitting in the background.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw, ServerCrash } from "lucide-react";

interface ServerDownCardProps {
  /**
   * The active URL locale. Kept as a prop (rather than read from
   * useLocale()) so the component renders even if NextIntlClientProvider
   * has not yet hydrated, which can happen when the service worker
   * served this page as an offline fallback.
   */
  locale: string;
}

const HEALTH_PROBE_TIMEOUT_MS = 5_000;

/**
 * Sanitise the `?next=` query value before navigating to it. Same-origin
 * absolute paths only — anything else (cross-origin URL, scheme-relative
 * URL, anchor-only, missing) falls back to /[locale]. This guards against
 * an open-redirect via crafted query-string.
 */
function safeNextTarget(next: string | null, locale: string): string {
  const fallback = `/${locale}`;
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.endsWith("/server-down")) return fallback;
  return next;
}

export function ServerDownCard({ locale }: ServerDownCardProps) {
  const t = useTranslations("server_down");
  const searchParams = useSearchParams();
  const [isRetrying, setIsRetrying] = useState(false);
  const [showStillDown, setShowStillDown] = useState(false);

  async function handleRetry() {
    if (isRetrying) return;
    setIsRetrying(true);
    setShowStillDown(false);
    try {
      // AbortSignal.timeout — fails fast if the API is genuinely down so the
      // user doesn't sit watching a spinner for the full TCP retry window.
      const res = await fetch("/api/health", {
        cache: "no-store",
        signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
      });
      if (res.ok) {
        // Navigate to the URL the user originally requested (the layout
        // forwards it via ?next=...) — a plain reload() would just
        // re-fetch /server-down. window.location.assign forces a full
        // navigation so middleware + RSC run again from scratch.
        const target = safeNextTarget(searchParams.get("next"), locale);
        window.location.assign(target);
        return;
      }
      setShowStillDown(true);
    } catch {
      setShowStillDown(true);
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div
      className="max-w-md space-y-6"
      data-testid="server-down-card"
      data-locale={locale}
    >
      <div className="flex justify-center">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)]/10"
          aria-hidden="true"
        >
          <ServerCrash className="h-8 w-8 text-[var(--primary)]" />
        </span>
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-[var(--body-on-dark)]">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
          {t("body")}
        </p>
      </div>
      <div className="space-y-3 pt-2">
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          data-testid="server-down-retry-button"
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[#181a20] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-progress disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {isRetrying ? t("retrying") : t("retry")}
        </button>
        {showStillDown && (
          <p
            role="alert"
            aria-live="polite"
            data-testid="server-down-still-unreachable"
            className="text-xs text-[var(--destructive,#ef4444)]"
          >
            {t("still_unreachable")}
          </p>
        )}
      </div>
    </div>
  );
}
