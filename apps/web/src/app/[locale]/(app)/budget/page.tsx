/**
 * BudgetPage — /[locale]/(app)/budget
 * RSC: Categories list with inline limit/share management.
 */
import { getTranslations } from "next-intl/server";
import { CategoryList } from "@/components/budgeting/category-list";
import { Suspense } from "react";

interface BudgetPageProps {
  params: Promise<{ locale: string }>;
}

export default async function BudgetPage({ params }: BudgetPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "budgeting_categories.categories" });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[16px] font-semibold text-[var(--on-dark)]">
          {t("title")}
        </h1>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <CategoryList locale={locale} />
      </Suspense>
    </main>
  );
}
