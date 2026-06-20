/**
 * BDP layout — pass-through for the catch-all `[[...tab]]/page.tsx`.
 *
 * The no-layout-shift fallback for the server membership gate now lives in the
 * sibling `loading.tsx`. That matters: a manual <Suspense> here would stream the
 * gate on a HARD load but would NOT make a client soft-navigation commit
 * instantly (App Router only commits the nav immediately when a `loading.tsx`
 * file exists for the segment). So the fallback moved to loading.tsx, which fixes
 * the home→BDP "waiting on the listing page" lag and still reserves the exact
 * sticky-band footprint. This layout keeps no Suspense of its own to avoid a
 * redundant second boundary above the loading.tsx one.
 *
 * Everything else — the pills band, the carousel, the tasks slider — lives in the
 * single client <BudgetDetail> tree (see budget-detail.tsx). The old
 * BudgetShellData / PageTransition / per-tab routes are gone: tab switching is
 * pure client state with no per-tab RSC round-trip.
 *
 * Z-stack (locked): top-nav header z-50 · BDP sticky band z-40 · BudgetSwitcher
 * popover z-[60].
 */

interface BdpLayoutProps {
  children: React.ReactNode;
}

export default function BdpLayout({ children }: BdpLayoutProps) {
  return children;
}
