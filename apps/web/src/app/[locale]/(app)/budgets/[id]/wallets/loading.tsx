/**
 * loading.tsx — Wallets tab skeleton (App Router Suspense fallback).
 *
 * Mirrors the real Wallets list (WalletsSectionedList → WalletSection →
 * WalletRow + DashedAddButton) so streaming the loaded page in causes no
 * layout shift:
 *   - Outer container matches page.tsx (`mx-auto w-full max-w-[1280px]`) +
 *     the list's own `flex flex-col gap-4 p-4 sm:p-6` so the section sits at
 *     the same x/y origin as the loaded list.
 *   - Renders the REAL translated SPENDINGS section title via getTranslations
 *     (same namespace + key the sectioned list uses) so the h3 doesn't jump.
 *   - ~6 row skeletons mirror wallet-row.tsx geometry (min-h, padding, radius,
 *     grip + dashed-circle icon + name + currency + amount columns).
 *   - A dashed "+ Add" outline mirrors DashedAddButton (empty, not filled).
 *
 * Pure async server component — no "use client", no hooks beyond
 * getTranslations (next-intl resolves the active [locale] from segment context).
 *
 * 260613-hig: instant skeleton on wallets tab navigation.
 * 260613: rewritten to mirror the real sectioned list (was a bogus tall
 * summary card + generic rows that caused content jump on load).
 */
import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function WalletsLoading() {
  // Same namespace + key the sectioned list uses for the SPENDINGS section
  // (wallets-sectioned-list.tsx / wallet-section.tsx → t("section.spendings")).
  // No params in loading.tsx — next-intl resolves the request locale from the
  // [locale] segment context, so the real title shows instantly and identically.
  const t = await getTranslations("bdp.tab.wallets");

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      {/* Mirrors WalletsSectionedList's outer container. */}
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {/* Mirrors a single WalletSection (SPENDINGS). */}
        <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-2">
          {/* Real translated SPENDINGS section title — matches the loaded h3. */}
          <h3 className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
            {t("section.spendings")}
          </h3>

          {/* ~6 row skeletons mirroring wallet-row.tsx geometry. */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[56px] items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px]"
            >
              {/* Grip placeholder (RowDragHandle). */}
              <Skeleton className="h-4 w-2 shrink-0" />
              {/* Dashed-circle icon placeholder (WalletCustomizer). */}
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              {/* Name line. */}
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-24" />
              </div>
              {/* Currency + amount columns. */}
              <div className="flex items-center gap-3">
                <Skeleton className="h-3.5 w-10" />
                <Skeleton className="h-3.5 w-12" />
              </div>
            </div>
          ))}

          {/* Dashed "+ Add" outline placeholder (DashedAddButton) — empty,
              not a solid Skeleton, to match the real dashed CTA. */}
          <div className="flex w-full min-h-[44px] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--muted-foreground)]" />
        </section>
      </div>
    </div>
  );
}
