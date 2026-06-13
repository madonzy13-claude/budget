/**
 * loading.tsx — Settings tab skeleton (App Router Suspense fallback).
 *
 * Mirrors settings form: labelled input rows and section dividers.
 * 260613-hig: instant skeleton on settings tab navigation.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6 px-4 pt-4 max-w-lg">
      {/* Section rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      {/* Action button placeholder */}
      <Skeleton className="h-10 w-32 rounded-lg" />
    </div>
  );
}
