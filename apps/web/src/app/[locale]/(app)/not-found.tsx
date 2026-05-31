import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Home } from "lucide-react";

/**
 * (app)/not-found.tsx — In-shell 404 for authenticated routes.
 *
 * Fires when:
 *   - a page in the (app) tree calls notFound() (e.g. a non-existent
 *     budget id under /budgets/<uuid>/...),
 *   - a URL under the (app) tree has no matching page (e.g. the bare
 *     /[locale]/budgets path which has no page.tsx — only sub-routes).
 *
 * Inherits the (app) shell layout (TopNav + sign-out cluster), so the
 * brand mark + budget switcher in the header already give the user a
 * way out. The body just provides a friendly explanation plus an
 * explicit Home button.
 */
export default async function AppNotFound() {
  const locale = await getLocale();
  const t = await getTranslations("not_found");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md space-y-6" data-testid="not-found-card">
        <p
          className="text-[64px] font-bold leading-none text-[var(--primary)] sm:text-[80px]"
          aria-hidden="true"
        >
          404
        </p>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-[var(--body-on-dark)]">
            {t("title")}
          </h1>
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
    </div>
  );
}
