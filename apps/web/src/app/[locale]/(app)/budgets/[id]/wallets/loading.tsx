/**
 * loading.tsx — Wallets tab skeleton (App Router Suspense fallback).
 *
 * Mirrors wallet rows: balance card + list of wallet entries.
 * 260613-hig: instant skeleton on wallets tab navigation.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function WalletsLoading() {
  return (
    <div className="space-y-3 px-4 pt-4">
      {/* Summary card */}
      <div className="rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] p-5 space-y-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-36" />
      </div>
      {/* Wallet rows */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg bg-[var(--surface-card-dark)] px-4 py-4"
        >
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}
