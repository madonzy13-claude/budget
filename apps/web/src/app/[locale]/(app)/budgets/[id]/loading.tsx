/**
 * loading.tsx — BDP shell skeleton (App Router Suspense fallback).
 *
 * Shown instantly on every navigation into /budgets/[id] while the layout
 * server RSC (membership check, tasks fetch) resolves. Mirrors layout.tsx
 * structure: sticky pill-tabs band + content block underneath.
 *
 * 260613-hig: added so BDP navigation shows an instant skeleton instead of
 * freezing the old page while layout.tsx awaits its three parallel fetches.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function BdpLoading() {
  return (
    <>
      {/* Sticky pills band placeholder — mirrors layout.tsx sticky wrapper */}
      <div
        className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]"
        aria-hidden="true"
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </div>
      {/* Content block placeholder */}
      <div className="pb-shell-safe space-y-4 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </>
  );
}
