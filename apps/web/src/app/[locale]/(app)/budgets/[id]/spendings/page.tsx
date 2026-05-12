import { getTranslations } from "next-intl/server";

/**
 * /budgets/[id]/spendings (BDP-02 default tab) — placeholder until Phase 4
 * ships the Excel-like categories grid.
 */
interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function SpendingsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bdp.tab.spendings" });
  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-8 sm:px-8">
      <h1 className="text-title-lg text-[var(--body-on-dark)]">{t("title")}</h1>
      <p className="mt-2 text-base text-[var(--muted-foreground)]">
        {t("placeholder")}
      </p>
    </main>
  );
}
