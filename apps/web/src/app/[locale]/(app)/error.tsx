"use client";

/**
 * (app)/error.tsx — Segment-level error boundary for authenticated shell.
 *
 * Catches any thrown error from a child server component (RSC fetch
 * failure, render-time exception) or client component (effect throw,
 * event handler throw routed via React 19 error overlay). The boundary
 * lives INSIDE the (app) layout, so the top nav + locale provider stay
 * mounted while the body shows a friendly fallback.
 *
 * Server-down case (e.g. `/api/budgets/active` returns 5xx or the fetch
 * itself rejects): HomePage throws → Next.js catches it here → user sees
 * a localised "couldn't load this page" message + a Reload action that
 * re-runs the failed render via the `reset()` callback Next.js provides.
 *
 * Why client component: Next.js requires error boundaries to be client
 * components (they hook into React's error boundary lifecycle).
 *
 * Why a layout-internal boundary (not global-error): a global error
 * boundary remounts the WHOLE document including the auth shell, which
 * loses session state and re-runs middleware/layout fetches. The
 * segment-level boundary keeps the header + locale + theme intact and
 * just retries the failing subtree.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppSegmentError({ error, reset }: ErrorPageProps) {
  const t = useTranslations("errors");

  useEffect(() => {
    // Surface the error in the browser console so a developer (or a
    // user with devtools open) can see the actual stack trace + digest.
    // Production builds redact the message client-side; the digest is
    // the only correlator with the server log.
    console.error("[AppSegmentError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-[var(--body-on-dark)]">
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">{t("body")}</p>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => reset()}
            data-testid="error-reload-button"
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[#181a20] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("reload")}
          </button>
        </div>
        {error.digest && (
          <p className="pt-4 text-[10px] text-[var(--muted-foreground)] opacity-60">
            ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
