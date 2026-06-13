/**
 * loading.tsx — Reserves tab skeleton (App Router Suspense fallback).
 *
 * Mirrors the REAL reserves tab (ReservesTableClient → ReservesTableRow +
 * ReservesTotalsFooter) so streaming the loaded page in causes no layout shift:
 *   - Outer container matches the client island's
 *     `flex flex-col gap-4 p-4 pb-20 sm:p-6`.
 *   - INCLUDED section mirrors the active ReservesTableRow geometry (min-h,
 *     padding, radius, grip + name + right-aligned amount) and renders the REAL
 *     translated "Included" h3 title (same namespace + key the island uses) so
 *     the section heading doesn't jump.
 *   - TOTALS card mirrors ReservesTotalsFooter (ml-auto right-aligned block,
 *     hairline border, 3 stacked rows; TOTAL USED carries the two-period
 *     this-month / all-time value stack).
 *   - EXCLUDED section renders the REAL "Excluded" h3 + the REAL empty message —
 *     during load the excluded list is usually empty, so this matches the common
 *     loaded state and avoids a jump.
 *
 * Pure async server component — no "use client", no hooks beyond
 * getTranslations (next-intl resolves the active [locale] from segment context).
 *
 * 260613-hig: instant skeleton on reserves tab navigation.
 * 260613: rewritten to mirror the real tab (was a bogus 3-col grid totals block
 * + progress-bar rows with no section titles that caused content jump on load).
 */
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function ReservesLoading() {
  // Same namespace + keys the client island uses (reserves-table-client.tsx →
  // t("section.included") / t("section.excluded") / t("section.excludedEmpty")).
  // No params in loading.tsx — next-intl resolves the request locale from the
  // [locale] segment context, so the real titles show instantly and identically.
  const t = await getTranslations("bdp.tab.reserves");

  return (
    // Mirrors ReservesTableClient's outer container.
    <div className="flex flex-col gap-4 p-4 pb-20 sm:p-6">
      {/* INCLUDED section — mirrors ActiveSection. */}
      <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] py-2 sm:p-2">
        {/* Real translated INCLUDED section title — matches the loaded h3. */}
        <h3 className="px-2 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("section.included")}
        </h3>

        {/* ~6 row skeletons mirroring reserves-table-row.tsx geometry. */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[56px] items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px]"
          >
            {/* Grip placeholder (RowDragHandle). */}
            <Skeleton className="h-4 w-2 shrink-0" />
            {/* Name line. */}
            <Skeleton className="h-3.5 w-24" />
            {/* Right-aligned amount line (Available cell). */}
            <Skeleton className="ml-auto h-3.5 w-12" />
          </div>
        ))}
      </section>

      {/* TOTALS card — mirrors ReservesTotalsFooter. */}
      <div className="ml-auto sm:mr-2 w-full sm:w-[340px] max-w-full rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] flex flex-col gap-2 px-4 py-3">
        {/* Row 1 — TOTAL AVAILABLE. */}
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        {/* Row 2 — TOTAL IN WALLETS. */}
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        {/* Row 3 — TOTAL USED (two-period this-month / all-time value stack). */}
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-2.5 w-24" />
          <div className="flex flex-col items-end gap-0.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        </div>
      </div>

      {/* EXCLUDED section — mirrors ExcludedSection. The excluded list is
          usually empty during load, so render the REAL empty message to match
          the common loaded state and avoid a jump. */}
      <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] py-2 sm:p-2">
        <h3 className="px-2 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("section.excluded")}
        </h3>
        <div className="px-3 py-2 text-caption text-[var(--muted-foreground)]">
          {t("section.excludedEmpty")}
        </div>
      </section>
    </div>
  );
}
