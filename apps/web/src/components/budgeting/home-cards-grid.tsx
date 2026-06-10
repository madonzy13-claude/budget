/**
 * home-cards-grid.tsx — responsive grid of BudgetCards with per-card Suspense
 * boundaries (D-PH3-11 streaming). A slow card never blocks its siblings.
 *
 * Breakpoints (UI-SPEC §4):
 *   <640px  → 1 column
 *   ≥640px  → 2 columns
 *   ≥1024px → 3 columns
 */
import { Suspense } from "react";
import { BudgetCard } from "@/components/budgeting/budget-card";
import { BudgetCardSkeleton } from "@/components/budgeting/budget-card-skeleton";
import type { BudgetSummary } from "@/components/budgeting/budget-switcher";

interface HomeCardsGridProps {
  budgets: BudgetSummary[];
  locale: string;
}

export function HomeCardsGrid({ budgets, locale }: HomeCardsGridProps) {
  return (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {budgets.map((b) => (
        <Suspense key={b.id} fallback={<BudgetCardSkeleton />}>
          <BudgetCard budget={b} locale={locale} />
        </Suspense>
      ))}
    </div>
  );
}
