/**
 * loading.tsx — Settings tab skeleton (App Router Suspense fallback).
 *
 * Mirrors the real SettingsAccordion card so there is no layout shift when
 * the page resolves: one rounded card, first section ("Budget Identity")
 * expanded with two value rows, then five collapsed trigger rows.
 * Pure server component — transient fallback, no client hooks.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-12 sm:px-6 sm:pb-16">
      <div className="overflow-hidden rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)]">
        {/* Section 1 — Budget Identity (open) */}
        <div className="border-b border-[var(--hairline-on-dark)]">
          {/* Trigger row */}
          <div className="flex items-start justify-between gap-4 px-6 py-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-4" />
          </div>
          {/* Expanded content */}
          <div className="bg-[#141920] px-6 py-5">
            <div className="divide-y divide-[var(--hairline-on-dark)]">
              {/* Row 1 — Name */}
              <div className="flex items-center justify-between gap-4 py-3">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-28" />
              </div>
              {/* Row 2 — Default currency (locked) */}
              <div className="flex items-center justify-between gap-4 py-3">
                <Skeleton className="h-3.5 w-28" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-12" />
                  <Skeleton className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sections 2-6 — collapsed trigger rows */}
        {/* Cushion */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--hairline-on-dark)] px-6 py-4 last:border-b-0">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
        </div>
        {/* Recurring Expenses */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--hairline-on-dark)] px-6 py-4 last:border-b-0">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-4" />
        </div>
        {/* Members */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--hairline-on-dark)] px-6 py-4 last:border-b-0">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
        </div>
        {/* Notifications */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--hairline-on-dark)] px-6 py-4 last:border-b-0">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-4" />
        </div>
        {/* Danger Zone */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--hairline-on-dark)] px-6 py-4 last:border-b-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </div>
      </div>
    </main>
  );
}
