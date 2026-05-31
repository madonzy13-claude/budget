"use client";

/**
 * [locale]/error.tsx — Locale-segment error boundary.
 *
 * Sits one level above (app)/error.tsx. Catches throws that bubble out of
 * any child page or layout INSIDE the [locale]/ segment — most importantly
 * an unhandled throw from (app)/layout.tsx itself (a layout's own errors
 * bubble UP to the PARENT segment's error.tsx, not into its own
 * error.tsx). Before this file existed those throws hit global-error.tsx,
 * which is hardcoded English and renders on a dark canvas — on a mobile
 * PWA the user saw the dark canvas before JS hydrated and reported it as
 * a "black screen".
 *
 * This boundary is rendered INSIDE the [locale]/layout.tsx provider tree,
 * so NextIntlClientProvider is available and we can localise the copy. If
 * [locale]/layout.tsx itself crashes (next-intl getMessages() rejecting,
 * invalid locale), control bypasses this file and hits the root
 * global-error.tsx — that file is the last-resort hardcoded fallback.
 *
 * Why client component: Next.js error boundaries hook into React's error
 * boundary lifecycle, which requires a client component.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

interface LocaleErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LocaleSegmentError({ error, reset }: LocaleErrorProps) {
  // Re-use the server_down namespace — when a layout throws because the
  // API container is unreachable the user-facing message should be the
  // same friendly "we can't reach the server" copy used by /server-down.
  const t = useTranslations("server_down");

  useEffect(() => {
    console.error("[LocaleSegmentError]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--canvas-dark)] px-6 py-12 text-center text-[var(--body-on-dark)]">
      <div className="max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
          {t("body")}
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => reset()}
            data-testid="locale-error-reload-button"
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[#181a20] transition-opacity hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
        {error.digest && (
          <p className="pt-4 text-[10px] opacity-50">ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
