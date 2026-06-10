/**
 * budget-card-skeleton.tsx — Suspense fallback for BudgetCard.
 *
 * Pure sync RSC. Mirrors BudgetCard's anatomy (header / stat row / overspent
 * strip) so the layout doesn't shift when streaming completes.
 */
import { Skeleton } from "@/components/ui/skeleton";

export function BudgetCardSkeleton() {
  return (
    <div
      className="rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)]"
      aria-hidden="true"
    >
      <div className="p-6 flex items-center gap-3">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-16 ml-auto" />
      </div>
      <div className="h-px bg-[var(--hairline-dark)]" />
      <div className="p-6 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="h-px bg-[var(--hairline-dark)]" />
      <div className="p-6 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}
