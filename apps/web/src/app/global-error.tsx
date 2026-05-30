"use client";

/**
 * global-error.tsx — Root error boundary for catastrophic failures.
 *
 * Triggers ONLY when the root layout or [locale]/layout.tsx itself
 * throws (e.g. NextIntlClientProvider crash, getMessages() rejecting,
 * invalid locale). Inside the (app) shell the segment-level
 * (app)/error.tsx handles errors with the layout still mounted; this
 * file is the last-resort fallback that replaces the entire document.
 *
 * Why hardcoded English: at this level the locale provider is unavailable
 * — useTranslations would itself crash. The message is intentionally
 * generic so it works regardless of the user's locale.
 *
 * Why <html><body>: per Next.js docs, global-error must render its own
 * <html> and <body> tags because it replaces the root layout when fired.
 */

import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#181a20",
          color: "#eaecef",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "420px", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 12px" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#848e9c",
              margin: "0 0 24px",
            }}
          >
            We couldn&apos;t load the app. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            data-testid="global-error-reload-button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "#fcd535",
              color: "#181a20",
              border: "none",
              padding: "10px 20px",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p
              style={{
                fontSize: "10px",
                color: "#848e9c",
                marginTop: "24px",
                opacity: 0.6,
              }}
            >
              ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
