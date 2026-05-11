import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CategoryList } from "@/components/budgeting/category-list";
import { CategoryFormSheet } from "@/components/budgeting/category-form-sheet";

interface BudgetPageProps {
  params: Promise<{ locale: string; wsId: string }>;
}

export default async function BudgetPage({ params }: BudgetPageProps) {
  const { locale, wsId } = await params;
  const t = await getTranslations({
    locale,
    namespace: "budgeting_categories.categories",
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[16px] font-semibold text-[var(--on-dark)]">
          {t("title")}
        </h1>
        <CategoryFormSheet addButtonLabel={t("addButton")} />
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <CategoryList locale={locale} wsId={wsId} />
      </Suspense>
    </main>
  );
}
