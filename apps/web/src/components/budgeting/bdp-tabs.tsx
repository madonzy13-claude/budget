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
}

const TABS: ReadonlyArray<{
  slug: "spendings" | "reserves" | "wallets" | "settings";
  icon: LucideIcon;
}> = [
  { slug: "spendings", icon: LayoutGrid },
  { slug: "reserves", icon: Coins },
  { slug: "wallets", icon: Wallet },
  { slug: "settings", icon: Settings },
];

export function BdpTabs({ locale, budgetId }: BdpTabsProps) {
  const pathname = usePathname() ?? "";
  const t = useTranslations("bdp.tab");

  return (
    <nav
      aria-label={t("aria")}
      className="flex h-12 items-center gap-2 px-4 sm:px-6"
    >
      {TABS.map(({ slug, icon: Icon }) => {
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
