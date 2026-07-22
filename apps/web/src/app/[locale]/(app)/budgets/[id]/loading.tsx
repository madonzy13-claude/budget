"use client";
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
 * The waiting layout is the shared <BdpOverviewSkeleton>. It lights the pill from
 * the URL (usePathname) — NOT always Overview — so a budget→budget switch that
 * carries the previous pill doesn't flash the Overview pill before the real page
 * jumps to the target pill (user report). Home auto-open lands on /overview, so
 * that path still shows the Overview pill.
 */
import { usePathname } from "next/navigation";
import { BdpOverviewSkeleton } from "@/components/budgeting/bdp-overview-skeleton";
import { isBdpTab } from "@/lib/bdp-tabs";

export default function BdpLoading() {
  const pathname = usePathname();
  const seg = pathname?.match(/\/budgets\/[^/]+\/([^/?#]+)/)?.[1];
  return <BdpOverviewSkeleton activeTab={isBdpTab(seg) ? seg : "overview"} />;
}
