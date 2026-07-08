/**
 * BDP loading.tsx — instant-commit skeleton for the catch-all [[...tab]] route.
 *
 * THE FIX (260620): a manual <Suspense> in the BDP layout does NOT make a client
 * soft-navigation commit instantly — App Router only commits a soft nav
 * immediately (streaming the page behind a fallback) when a `loading.tsx` exists
 * for the segment. Without it the router held the listing page visible for the
 * ~330ms server membership gate in [[...tab]]/page.tsx. With it, this skeleton
 * paints the instant the URL changes and <BudgetDetail> swaps in once the gate
 * resolves.
 *
 * The waiting layout is the shared <BdpOverviewSkeleton> (Overview is the landing
 * tab), rendered here AND by the home auto-open (home-budgets-client.tsx), so the
 * home→budget path is one continuous Overview skeleton with no jump.
 */
import { BdpOverviewSkeleton } from "@/components/budgeting/bdp-overview-skeleton";

export default function BdpLoading() {
  return <BdpOverviewSkeleton />;
}
