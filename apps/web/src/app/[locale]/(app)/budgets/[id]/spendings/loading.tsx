/**
 * loading.tsx — Spendings tab skeleton (App Router Suspense fallback).
 *
 * Mirrors spendings grid: month header row + repeating expense rows.
 * 260613-hig: instant skeleton on spendings tab navigation.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function SpendingsLoading() {
  return (
    <div className="space-y-1 px-4 pt-4">
      {/* Month header */}
      <Skeleton className="mb-3 h-5 w-28" />
      {/* Expense rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
