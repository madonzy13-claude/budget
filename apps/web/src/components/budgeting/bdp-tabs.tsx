"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutGrid,
  Coins,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * BdpTabs — route-as-tab pill navigation for the Budget Detail Page.
 *
 * Each pill is a real <Link> so browser back/forward respects route changes
 * (BDP-05 / D-PH3-04). The active pill is derived from `usePathname()` —
 * matching its href prefix — and rendered with the yellow `--primary`
 * background + `--on-primary` text per D-PH3-02. Inactive pills hide their
 * label text on mobile (`hidden sm:inline`) so the four icons fit the 360px
 * viewport; active pill always shows its label.
 *
 * Labels resolve from i18n via `t("bdp.tab.{slug}.label")` — the nested shape
 * locked by Task 1 of Plan 03-06 (see <i18n_shape_decision> in 03-06-PLAN).
 */

interface BdpTabsProps {
  locale: string;
  budgetId: string;
  // D-PH5-R11 cascading-hide surface 1: when false, Reserves pill is hidden.
  // Default true preserves existing UX for all existing budgets.
  reservesEnabled?: boolean;
}

// UAT-PH5-T2-02: Wallets surfaced first per user feedback. Order now is
// Wallets → Spendings → Reserves → Settings. The /budgets/[id] index page
// redirects to /wallets accordingly.
const TABS: ReadonlyArray<{
  slug: "wallets" | "spendings" | "reserves" | "settings";
  icon: LucideIcon;
}> = [
  { slug: "wallets", icon: Wallet },
  { slug: "spendings", icon: LayoutGrid },
  { slug: "reserves", icon: Coins },
  { slug: "settings", icon: Settings },
];

export function BdpTabs({
  locale,
  budgetId,
  reservesEnabled = true,
}: BdpTabsProps) {
  const pathname = usePathname() ?? "";
  const t = useTranslations("bdp.tab");

  // D-PH5-R11: filter Reserves pill when reserves are disabled.
  const visibleTabs = reservesEnabled
    ? TABS
    : TABS.filter((t) => t.slug !== "reserves");

  return (
    <nav
      aria-label={t("aria")}
      className="flex h-12 items-center justify-center gap-2 px-4 sm:px-6"
    >
      {visibleTabs.map(({ slug, icon: Icon }) => {
        const href = `/${locale}/budgets/${budgetId}/${slug}`;
        const active = pathname.startsWith(href);
        const label = t(`${slug}.label`);
        return (
          <Link
            key={slug}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] px-4 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]",
              "min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0",
              active
                ? "bg-[var(--primary)] text-[var(--on-primary)] text-sm font-semibold"
                : "text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body-on-dark)]",
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            <span className={cn(active ? "inline" : "hidden sm:inline")}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
