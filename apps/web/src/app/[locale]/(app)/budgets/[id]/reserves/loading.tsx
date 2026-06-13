/**
 * loading.tsx — Reserves tab skeleton (App Router Suspense fallback).
 *
 * Mirrors reserves: summary totals block + repeating reserve category rows.
 * 260613-hig: instant skeleton on reserves tab navigation.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function ReservesLoading() {
  return (
    <div className="space-y-3 px-4 pt-4">
      {/* Totals summary */}
      <div className="rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] p-5 grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
      {/* Reserve rows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg bg-[var(--surface-card-dark)] px-4 py-4 space-y-2"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}
