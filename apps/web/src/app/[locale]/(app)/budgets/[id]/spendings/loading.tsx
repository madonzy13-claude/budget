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
    <div className="w-max min-w-[140px] sm:min-w-[160px] flex flex-col flex-shrink-0 rounded-xl bg-[var(--surface-card-dark)] overflow-clip">
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

      {/* Expenses section: label + quick-entry box + a few expense lines */}
      <div className="flex flex-col gap-2 px-2 py-2">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="h-9 w-full rounded-md" />
        <div className="flex flex-col gap-2 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
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

      {/* Grid container — horizontal column cards (matches real mt-4 px-3/6) */}
      <div className="mt-4 flex gap-[var(--spacing-xs)] overflow-x-hidden px-3 sm:px-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <ColumnCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
