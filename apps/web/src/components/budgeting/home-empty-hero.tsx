/**
 * home-empty-hero.tsx — empty state for the home page (zero accessible budgets).
 *
 * Async RSC. Heading + body + primary CTA Link → `/{locale}/budgets/new`.
 * Renders inside <main> so the empty branch composes as its own page region.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export async function HomeEmptyHero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "home.empty" });
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
        <Link href={`/${locale}/budgets/new`}>{t("cta")}</Link>
      </Button>
    </main>
  );
}
