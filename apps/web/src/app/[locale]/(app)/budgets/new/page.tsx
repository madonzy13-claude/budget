import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * /budgets/new (D-PH3-18) — placeholder route so the NewBudgetButton from
 * Plan 03-04 + BudgetSwitcher empty-state CTA route somewhere. Phase 6 fills
 * the actual onboarding wizard.
 */
interface NewBudgetPageProps {
  params: Promise<{ locale: string }>;
}

export default async function NewBudgetPage({ params }: NewBudgetPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "budgets.new" });
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-8 px-4 py-16 sm:px-6">
      <h1 className="text-title-lg text-[var(--body-on-dark)]">{t("title")}</h1>
      <p className="max-w-prose text-base text-[var(--muted-foreground)]">
        {t("placeholder")}
      </p>
      <Link
        href={`/${locale}`}
        className="text-sm text-[var(--primary)] underline"
      >
        {t("backToHome")}
      </Link>
    </main>
  );
}
