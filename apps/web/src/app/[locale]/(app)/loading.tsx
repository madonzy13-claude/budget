/**
 * loading.tsx — Home route skeleton (App Router Suspense fallback).
 *
 * Shown instantly on every navigation to "/" (home) while server RSC data
 * loads. Mirrors HomeCardsGrid layout (1/2/3-col grid) using BudgetCardSkeleton
 * primitives — no layout shift when streaming completes.
 *
 * 260613-hig: added so navigation to home shows an instant skeleton instead
 * of freezing the old page for ~2s while listForUser executes.
 */
import { BudgetCardSkeleton } from "@/components/budgeting/budget-card-skeleton";

export default function HomeLoading() {
  return (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      <BudgetCardSkeleton />
      <BudgetCardSkeleton />
      <BudgetCardSkeleton />
    </div>
  );
}
