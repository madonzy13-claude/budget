/**
 * BDP loading.tsx — instant-commit skeleton for the catch-all [[...tab]] route.
 *
 * THE FIX (260620 — "moving listing→BDP feels like we wait on the listing
 * page"): a manual <Suspense> in the BDP layout does NOT make a client
 * soft-navigation commit instantly. App Router holds the PREVIOUS page visible
 * until it has the new segment's RSC payload — UNLESS a `loading.tsx` exists, in
 * which case it commits the navigation IMMEDIATELY and streams the page in behind
 * this fallback. The server membership gate in [[...tab]]/page.tsx took ~343ms, so
 * without this file home→BDP held the listing page for that whole gate. With it,
 * the band + a waiting skeleton paint the instant the URL changes, then
 * <BudgetDetail> swaps in once the gate resolves (each pane then renders from the
 * React Query cache, or its own per-tab skeleton on a cold cache).
 *
 * Zero-shift contract: the band is the SAME sticky wrapper + h-12 nav row as the
 * live BdpTabs band (see budget-detail.tsx + the old BdpBandFallback), so the real
 * band fades into reserved space with no jump. The band bar paints instantly; the
 * pill + pane placeholders use the delayed Skeleton (invisible for 200ms) so a
 * fast gate never flashes them.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function BdpLoading() {
  return (
    <>
      {/* Sticky pills-band footprint — matches the live band wrapper exactly. */}
      <div
        aria-hidden="true"
        className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]"
      >
        <div className="flex h-12 items-center gap-2 px-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>

      {/* Generic pane skeleton — a few rows; covers whichever tab a deep-link
          targets until BudgetDetail mounts and shows its own per-tab skeleton. */}
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-4">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 w-32" />
              <div className="ml-auto flex gap-3">
                <Skeleton className="h-3.5 w-10" />
                <Skeleton className="h-3.5 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
