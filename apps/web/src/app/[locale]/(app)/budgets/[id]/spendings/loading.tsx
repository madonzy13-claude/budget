/**
 * loading.tsx — Spendings tab skeleton (App Router Suspense fallback).
 *
 * Mirrors the real spendings layout: a centred MonthNavigator pill followed by
 * the horizontal grid of category COLUMN CARDS. Each card placeholder matches
 * the loaded column's classes (paddings, hairline separators, surface tokens)
 * so the skeleton lines up with the content it replaces.
 *
 * Pure server component (no "use client", no hooks) — standalone-safe.
 * 260613-jp6: skeleton must mirror the spendings grid, not a generic list.
 */
import { Skeleton } from "@/components/ui/skeleton";

/** One label-over-value summary row (planned / overspent / reserves / left). */
function SummaryRow({ valueClass = "w-10" }: { valueClass?: string }) {
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 border-b border-[var(--hairline-dark)]">
      <Skeleton className="h-2.5 w-12" />
      <Skeleton className={`h-3.5 ${valueClass}`} />
    </div>
  );
}

/** One category column card placeholder. */
function ColumnCardSkeleton() {
  return (
    // h-full: stretch to the grid row's fixed height so the card reaches the
    // bottom (matches the real column inside h-[var(--grid-max-h,80vh)]).
    <div className="h-full w-max min-w-[140px] sm:min-w-[160px] flex flex-col flex-shrink-0 rounded-xl bg-[var(--surface-card-dark)] overflow-clip">
      {/* Header row — grip dots + name line */}
      <div className="flex min-h-[44px] items-center gap-1.5 px-2 py-2 border-b border-[var(--hairline-dark)]">
        <Skeleton className="h-3.5 w-2.5 shrink-0" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>

      {/* Four summary rows: planned / overspent / reserves used / left.
          "reserves used" is wider to mimic "53 / 324.90". */}
      <SummaryRow />
      <SummaryRow />
      <SummaryRow valueClass="w-16" />
      <SummaryRow />

      {/* Expenses section — flex-1 so the card body fills downward (mirrors the
          real transaction list `flex-1 w-0 min-w-full`). Label + outlined
          quick-entry box + expense lines sit at the TOP; the rest is empty
          card surface, exactly like a real column with few transactions. */}
      <div className="flex flex-1 flex-col gap-2 px-2 py-2">
        <Skeleton className="h-2.5 w-14" />
        {/* Outlined empty quick-entry box (not a filled blob) — mirrors the
            real bordered, mostly-empty "..." input. */}
        <div className="h-9 w-full rounded-md border border-[var(--hairline-dark)]" />
        <div className="flex flex-col gap-2 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-10" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SpendingsLoading() {
  return (
    <div>
      {/* MonthNavigator placeholder — centred "‹ June 2026 ›" row */}
      <div className="flex h-12 items-center justify-center gap-2 px-4 border-b border-[var(--hairline-dark)]">
        <Skeleton className="h-5 w-5 shrink-0 rounded" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-5 shrink-0 rounded" />
      </div>

      {/* Grid — two-level structure mirroring the real grid
          (spendings-grid-client.tsx:610/617):
            outer = scroll container, h-[80vh] matches the real
              `h-[var(--grid-max-h,80vh)]` pre-measure fallback (no JS var);
            inner = `flex gap-2 w-fit mx-auto` — the columns row (gap-2 = 8px
              between cards, centred), so the skeleton spaces + centres exactly
              like the loaded grid. */}
      <div className="mt-4 h-[80vh] overflow-x-hidden px-3 sm:px-6">
        <div className="flex gap-2 w-fit mx-auto">
          {Array.from({ length: 3 }).map((_, i) => (
            <ColumnCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
