"use client";
/**
 * overview-tab.tsx — the Overview BDP tab body (Phase 11, 11-08).
 *
 * Renders the five summary cards now; the four collapsible sections (Planned ·
 * Overspent · Reserves · Financial Wealth) + the range selector land in 11-09 and
 * mount into the slot below. Width-flexible — no element forces document width past
 * the viewport at 375px (SC1).
 */
import { OverviewCards } from "@/components/budgeting/overview/overview-cards";

export function OverviewTab({ budgetId }: { budgetId: string }) {
  return (
    <div
      data-testid="overview-tab"
      className="flex w-full min-w-0 flex-col gap-4 px-4 pt-4 pb-12 sm:px-6 sm:pb-16"
    >
      <OverviewCards budgetId={budgetId} />
      {/* Range selector + 4 collapsible sections (Planned · Overspent · Reserves ·
          Financial Wealth) mount here in 11-09. */}
    </div>
  );
}
