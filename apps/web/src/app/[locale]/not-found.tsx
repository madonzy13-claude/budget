import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Home } from "lucide-react";
import { BrandMark } from "@/components/common/brand-mark";

/**
 * [locale]/not-found.tsx — Friendly localized 404 for any URL that doesn't
 * match a route under /[locale]. Catches both `notFound()` calls inside
 * sibling pages and Next.js's own no-route-matched fallback.
 *
 * Why a brand header: the prior behavior dropped users onto Next.js's
 * built-in 404 page — pure text on a white background with no link out.
 * On mobile that was a dead-end (no browser chrome in PWA standalone mode
 * to reach the home URL). The header strip gives them a single tap back
 * to the locale root via the brand wordmark; the body adds an explicit
 * "Take me home" button for accessibility / discoverability.
 *
 * Why server component: nothing here is interactive — both navigation
 * affordances are <Link> elements which Next handles client-side via
 * the router without needing a client island.
 *
 * Note: Next.js does not pass route params to not-found.tsx (it can fire
 * for URLs that haven't been routed into a segment yet). We read the
 * locale via next-intl's getLocale() which reflects the negotiated locale
 * from middleware/headers.
 */
export default async function LocaleNotFound() {
  const locale = await getLocale();
  const t = await getTranslations("not_found");

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--canvas-dark)] text-[var(--body-on-dark)]">
      <header className="z-50 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
          <BrandMark href={`/${locale}`} />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="max-w-md space-y-6" data-testid="not-found-card">
          <p
            className="text-[64px] font-bold leading-none text-[var(--primary)] sm:text-[80px]"
            aria-hidden="true"
          >
            404
          </p>
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">{t("title")}</h1>
            <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
              {t("body")}
            </p>
          </div>
          <div className="pt-2">
            <Link
              href={`/${locale}`}
              data-testid="not-found-home-button"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[#181a20] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              {t("go_home")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
