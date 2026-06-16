/**
 * /budgets/[id]/spendings — STATIC RSC shell (SPA refactor 260616).
 *
 * No server data fetch. A dynamic serverApiFetch here (reads cookies) forced the
 * segment to re-execute on EVERY soft-nav and flash loading.tsx — even when the
 * client React Query cache was warm from seconds ago. Removing it makes the route
 * a prefetchable static shell, so returning to Spendings renders the cached grid
 * instantly with no skeleton.
 *
 * The grid (categories + per-month summary/transactions/drafts) and the budget
 * meta (currency, tz, reserves/cushion flags) are all fetched client-side by
 * SpendingsGridClient via React Query — served instantly from the persisted
 * cache when warm, skeleton only on a genuine cold load. The viewed month comes
 * from the URL (?month) via useMonthParam inside the client island.
 */
import { SpendingsGridClient } from "@/components/budgeting/spendings-grid/spendings-grid-client";
import { ScrollResetOnMount } from "@/components/common/scroll-reset-on-mount";

// quick-260612-a0c R2: PillTaskSlider no longer renders here — the BDP layout
// renders the active pill's slider INSIDE the [data-bdp-tabs] sticky band so
// it can never slide under the pinned header (see ActivePillTaskSlider).

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function SpendingsPage({ params }: PageProps) {
  const { id: budgetId } = await params;

  // SHELL-R14: data-no-page-clearance opts this inner-scrolling tab out of the
  // page-level bottom clearances (browser floor + standalone pb-shell-safe) that
  // would dead-strip below the grid box. The grid scroller owns all vertical
  // scroll; clearance lives in the in-flow tail spacer inside it.
  return (
    <div data-no-page-clearance>
      {/* Tab-switch scroll reset: wallets/home are page-scrolling tabs; when the
          user switches to spendings, the shared main[data-shell-scroll] container
          retains its scrollTop from the previous tab. Reset it to 0 so the month
          navigator is not hidden under the pinned pills band and so --grid-max-h
          measurement (rect.top) is taken at the correct position. */}
      <ScrollResetOnMount />
      <SpendingsGridClient budgetId={budgetId} />
    </div>
  );
}
