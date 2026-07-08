/**
 * BDP loading.tsx — instant-commit skeleton for the catch-all [[...tab]] route.
 *
 * THE FIX (260620): a manual <Suspense> in the BDP layout does NOT make a client
 * soft-navigation commit instantly — App Router only commits a soft nav
 * immediately (streaming the page behind a fallback) when a `loading.tsx` exists
 * for the segment. Without it the router held the listing page visible for the
 * ~330ms server membership gate in [[...tab]]/page.tsx. With it, this skeleton
 * paints the instant the URL changes and <BudgetDetail> swaps in once the gate
 * resolves.
 *
 * ONE waiting layout: this renders the SAME thing the cold <BudgetDetail> shows on
 * the landing tab — a real-styled pills band (Overview active) + the Overview
 * cards skeleton — so loading→loaded is a single continuous skeleton with no jump.
 *
 * Phase-11 fix: the landing tab is OVERVIEW, not Wallets. The prior skeleton
 * predated the Overview redesign — it rendered a 4-pill band (Wallets active) +
 * the WalletsSkeleton, so opening a budget flashed the old Wallets-first layout
 * and then jumped to the 5-pill Overview layout once data landed. This now
 * mirrors the real BdpTabs band (TAB_ORDER, Overview active, gap-1.5 / px-3 /
 * size-5) and the OverviewCards isPending skeleton.
 *
 * Static, not interactive: this is a server fallback, so the band is plain markup
 * (no onSelect / no badge query / no framer) — it just reserves the exact band +
 * pane geometry. It assumes the common landing case (Overview + reserves enabled);
 * a deep-link straight to another tab (or a reserves-off budget) gets a brief band
 * correction when <BudgetDetail> mounts, which is rare and acceptable.
 */
import { getTranslations } from "next-intl/server";
import {
  LayoutDashboard,
  LayoutGrid,
  Coins,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mirrors OVERVIEW-CARDS' CARD constant (a client const, so re-declared here).
const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

// Mirrors bdp-tabs.tsx TABS (icons + TAB_ORDER). Overview leads and is active.
const TABS: ReadonlyArray<{ slug: string; icon: LucideIcon }> = [
  { slug: "overview", icon: LayoutDashboard },
  { slug: "wallets", icon: Wallet },
  { slug: "spendings", icon: LayoutGrid },
  { slug: "reserves", icon: Coins },
  { slug: "settings", icon: Settings },
];

export default async function BdpLoading() {
  const t = await getTranslations("bdp.tab");

  return (
    <>
      {/* Sticky pills band — same wrapper + nav classes as the live BdpTabs band
          (bdp-tabs.tsx) so the real band fades in with zero shift. No data-testid:
          that marks the *real* band (geometry proofs + the nav measurement key off
          it). */}
      <div
        aria-hidden="true"
        className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]"
      >
        <nav
          aria-label={t("aria")}
          className="flex h-12 items-center justify-center gap-1.5 overflow-x-auto px-4 sm:px-6"
        >
          {TABS.map(({ slug, icon: Icon }) => {
            const active = slug === "overview";
            return (
              <span
                key={slug}
                className={cn(
                  "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] px-3",
                  "min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0",
                  active
                    ? "text-[var(--on-primary)] text-sm font-semibold"
                    : "text-[var(--muted-foreground)]",
                )}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 z-0 rounded-[var(--radius-pill)] bg-[var(--primary)]"
                  />
                )}
                <Icon
                  className="relative z-10 size-5 shrink-0"
                  aria-hidden="true"
                />
                {/* Settings is icon-only on mobile in the live band (reserves on);
                    the active pill shows its label, the rest are label-on-sm. */}
                <span
                  className={cn(
                    "relative z-10",
                    slug === "settings"
                      ? "hidden sm:inline"
                      : active
                        ? "inline"
                        : "hidden sm:inline",
                  )}
                >
                  {t(`${slug}.label`)}
                </span>
              </span>
            );
          })}
        </nav>
      </div>

      {/* Pane — mirrors the cold OverviewTab first paint (Overview is the landing
          tab): the OverviewCards isPending skeleton (h-28 hero + 2×2 stat cards)
          plus the ProjectionTimeline isLoading bar, in the same max-w container.
          animate-pulse, visible from frame 0 (the gate is always ~330ms). */}
      <div className="overflow-x-clip">
        <div className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-4 px-4 pt-4 sm:px-6">
          <div className="flex flex-col gap-3">
            <div className={cn(CARD, "h-28 animate-pulse")} aria-hidden="true" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(CARD, "h-24 animate-pulse")}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
          <div
            className={cn(CARD, "h-[104px] animate-pulse")}
            aria-hidden="true"
          />
        </div>
      </div>
    </>
  );
}
