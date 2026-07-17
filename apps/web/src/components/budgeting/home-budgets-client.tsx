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
import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActiveBudgets } from "@/hooks/use-active-budgets";
import { LAST_BUDGET_KEY } from "@/lib/last-budget";
import { BudgetCardSkeleton } from "@/components/budgeting/budget-card-skeleton";
import { BdpOverviewSkeleton } from "@/components/budgeting/bdp-overview-skeleton";
import { HomeEmptyHero } from "@/components/budgeting/home-empty-hero";
import { AggregateOverview } from "@/components/budgeting/aggregate/aggregate-overview";

export function HomeBudgetsClient({ locale }: { locale: string }) {
  const t = useTranslations("home");
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = useActiveBudgets();
  const budgets = q.data ?? [];

  // r35: auto-open a budget instead of the listing.
  //  - exactly 1 budget → ALWAYS its overview (there's always a route to it).
  //  - >1 budgets on a plain landing (app reopen, no ?list) → the last-visited
  //    budget's overview. The logo links here with ?list=1 to FORCE the listing
  //    when there's more than one budget.
  const wantsList = searchParams.get("list") === "1";
  const redirectTo = useMemo(() => {
    if (!q.isSuccess || budgets.length === 0) return null;
    if (budgets.length === 1) {
      return `/${locale}/budgets/${budgets[0]!.id}/overview`;
    }
    if (wantsList || typeof window === "undefined") return null;
    const last = window.localStorage.getItem(LAST_BUDGET_KEY);
    return last && budgets.some((b) => b.id === last)
      ? `/${locale}/budgets/${last}/overview`
      : null;
  }, [q.isSuccess, budgets, wantsList, locale]);

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  // Resolved with no budgets → full-bleed empty hero (matches the old page).
  if (q.isSuccess && budgets.length === 0) {
    return <HomeEmptyHero locale={locale} />;
  }

  // Auto-open path: render the SAME Overview skeleton the BDP loading.tsx shows,
  // so home→budget is ONE continuous skeleton and the budget LIST never flashes on
  // the way in. We take this whenever we're heading into a budget:
  //   - a confirmed redirect (redirectTo resolved), OR
  //   - a plain landing (no ?list) still resolving — the default outcome is
  //     auto-open (1 budget always routes; >1 reopens the last-visited budget).
  // The listing only wins on an explicit ?list=1 or a RESOLVED multi-budget landing
  // with no last-visited memory. The redirect is a client soft-nav → the shell
  // stays mounted → no iOS safe-area top-inset re-jump on the destination.
  const headingToBudget = redirectTo !== null || (!wantsList && !q.isSuccess);
  if (headingToBudget) {
    return <BdpOverviewSkeleton />;
  }

  // No data yet (cold load OR a transient offline error before the persisted
  // cache hydrated) → skeletons, NEVER a bare empty grid (260616: the offline
  // refetch could error and leave budgets=[] with isPending false, which used to
  // render an empty page). A confirmed success-empty is the empty-hero above.
  const showSkeleton = budgets.length === 0;

  return (
    <main className="pb-shell-safe mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-12">
      <h1 className="text-title-lg text-[var(--body-on-dark)] mb-6">
        {t("heading")}
      </h1>
      {/* Task 16: the resolved explicit-list view (≥2 budgets — the only real
       * (non-skeleton) budgets.length this branch ever sees, since 1 budget
       * always redirects above) renders the cross-budget AggregateOverview
       * instead of individual BudgetCardClient cards. */}
      {showSkeleton ? (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <BudgetCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <AggregateOverview />
      )}
    </main>
  );
}
