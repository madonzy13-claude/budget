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
 * ONE waiting layout (260620 follow-up — "it flickers from one waiting layout to
 * another"): the first cut rendered a GENERIC skeleton (blank pills + plain
 * rows), which then flickered into the real band + the Wallets tab's own
 * WalletsSkeleton before the data landed — two different waiting layouts. This
 * now renders the SAME thing the cold <BudgetDetail> shows: a real-styled pills
 * band (Wallets active) + the shared <WalletsSkeleton>. So loading.tsx and the
 * cold client view are pixel-identical and only one skeleton is ever seen.
 *
 * Static, not interactive: this is a server fallback, so the band is plain markup
 * (no onSelect / no badge query / no framer) — it just reserves the exact band +
 * pane geometry. It assumes the common landing case (Wallets tab, reserves
 * enabled); a deep-link straight to another tab gets a brief band correction when
 * <BudgetDetail> mounts, which is rare and acceptable.
 */
import { getTranslations } from "next-intl/server";
import {
  LayoutGrid,
  Coins,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletsSkeleton } from "@/components/budgeting/wallets-tab/wallets-skeleton";

const TABS: ReadonlyArray<{ slug: string; icon: LucideIcon }> = [
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
          (budget-detail.tsx) so the real band fades in with zero shift. No
          data-testid: that marks the *real* band (geometry proofs + the nav
          measurement key off it). */}
      <div
        aria-hidden="true"
        className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]"
      >
        <nav
          aria-label={t("aria")}
          className="flex h-12 items-center justify-center gap-2 px-4 sm:px-6"
        >
          {TABS.map(({ slug, icon: Icon }) => {
            const active = slug === "wallets";
            return (
              <span
                key={slug}
                className={cn(
                  "relative inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] px-4",
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
                  className="relative z-10 size-[18px]"
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "relative z-10",
                    active ? "inline" : "hidden sm:inline",
                  )}
                >
                  {t(`${slug}.label`)}
                </span>
              </span>
            );
          })}
        </nav>
      </div>

      {/* Pane — the SAME skeleton the cold Wallets tab renders (the common
          landing tab), so loading→loaded is a single continuous skeleton. */}
      <div className="pb-shell-safe">
        <WalletsSkeleton label={t("wallets.section.spendings")} />
      </div>
    </>
  );
}
