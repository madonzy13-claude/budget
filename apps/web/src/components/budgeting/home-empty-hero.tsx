"use client";
/**
 * home-empty-hero.tsx — empty state for the home page (zero accessible budgets).
 *
 * Client component: it is rendered by HomeBudgetsClient ("use client"), so it
 * must read translations via the client `useTranslations` hook. It previously
 * used the async server `getTranslations`, which made it an async component
 * inside the client module graph — React cannot render an async client
 * component, so the empty hero (and its "Create your first budget" CTA) never
 * appeared and the home page hung on a blank/skeleton state for budget-less
 * users. Heading + body + primary CTA Link → `/{locale}/budgets/new`.
 */
import { NavLink } from "@/components/common/nav-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function HomeEmptyHero({ locale }: { locale: string }) {
  const t = useTranslations("home.empty");
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-10 px-4 py-16 sm:px-6">
      <div className="space-y-3">
        <h1 className="text-title-lg text-[var(--body-on-dark)]">
          {t("heading")}
        </h1>
        <p className="max-w-prose text-base text-[var(--muted-foreground)]">
          {t("body")}
        </p>
      </div>
      <Button asChild size="lg" variant="primary">
        <NavLink href={`/${locale}/budgets/new`}>{t("cta")}</NavLink>
      </Button>
    </main>
  );
}
