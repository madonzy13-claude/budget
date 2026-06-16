"use client";
/**
 * home-budgets-client.tsx — client-data home dashboard (SPA refactor 260616).
 *
 * Replaces the SSR home page body (fetchActiveBudgets + HomeCardsGrid +
 * HomeOfflineCache). useActiveBudgets feeds the grid; each BudgetCardClient
 * fetches its own summary. The page stays a static shell so returning home
 * renders instantly from the warm React Query cache (no (app)/loading flash);
 * the per-card skeletons cover a genuine cold load.
 */
import { useTranslations } from "next-intl";
import { useActiveBudgets } from "@/hooks/use-active-budgets";
import { BudgetCardClient } from "@/components/budgeting/budget-card-client";
import { BudgetCardSkeleton } from "@/components/budgeting/budget-card-skeleton";
import { HomeEmptyHero } from "@/components/budgeting/home-empty-hero";

export function HomeBudgetsClient({ locale }: { locale: string }) {
  const t = useTranslations("home");
  const q = useActiveBudgets();
  const budgets = q.data ?? [];

  // Resolved with no budgets → full-bleed empty hero (matches the old page).
  if (q.isSuccess && budgets.length === 0) {
    return <HomeEmptyHero locale={locale} />;
  }

  return (
    <main className="pb-shell-safe mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-12">
      <h1 className="text-title-lg text-[var(--body-on-dark)] mb-6">
        {t("heading")}
      </h1>
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {q.isPending
          ? Array.from({ length: 3 }).map((_, i) => (
              <BudgetCardSkeleton key={i} />
            ))
          : budgets.map((b) => (
              <BudgetCardClient key={b.id} budget={b} locale={locale} />
            ))}
      </div>
    </main>
  );
}
