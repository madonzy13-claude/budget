import Link from "next/link";

/**
 * app/not-found.tsx — Root-level fallback 404.
 *
 * In normal flow the next-intl middleware locale-prefixes every incoming
 * URL, so a stray request like `/random` becomes `/en/random` and is
 * caught by [locale]/not-found.tsx (which is fully styled + localised).
 * This file is the belt-and-suspenders fallback for the rare cases
 * Next.js renders the root-level not-found directly — typically because
 * a top-level route file calls notFound() before the locale segment
 * has run.
 *
 * Hardcoded English with inline styles: at this level next-intl is not
 * guaranteed to be active (no NextIntlClientProvider above us) and CSS
 * variables from global.css may or may not be loaded. Inline styles
 * keep this readable in every degraded condition.
 */
export default function RootNotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#181a20",
        color: "#eaecef",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: "420px" }}>
        <p
          style={{
            fontSize: "64px",
            fontWeight: 700,
            lineHeight: 1,
            color: "#fcd535",
            margin: "0 0 16px",
          }}
          aria-hidden="true"
        >
          404
        </p>
        <h1 style={{ fontSize: "22px", fontWeight: 600, margin: "0 0 12px" }}>
          Page not found
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#848e9c",
            margin: "0 0 24px",
            lineHeight: 1.5,
          }}
        >
          That page doesn&apos;t exist — it may have moved, been renamed, or you
          might have followed a stale link.
        </p>
        <Link
          href="/en"
          data-testid="root-not-found-home-link"
          style={{
            display: "inline-block",
            backgroundColor: "#fcd535",
            color: "#181a20",
            textDecoration: "none",
            padding: "10px 20px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Take me home
        </Link>
      </div>
    </main>
  );
}
