"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NavLink } from "@/components/common/nav-link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutGrid,
  Coins,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clientApiFetch } from "@/lib/budget-fetch";
import { usePrefetchBudgetTabs } from "@/hooks/use-prefetch-budget-tabs";
import { motion } from "motion/react";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";
import { PillBadge } from "@/components/budgeting/tasks/pill-badge";
import { pillFor, type Pill } from "@/components/budgeting/tasks/kind-pill-map";

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
  initialTasks?: TaskSummary[];
}

// UAT-PH5-T2-02: Wallets surfaced first per user feedback. Order now is
// Wallets → Spendings → Reserves → Settings. The /budgets/[id] index page
// redirects to /wallets accordingly.
const TABS: ReadonlyArray<{ slug: Pill; icon: LucideIcon }> = [
  { slug: "wallets", icon: Wallet },
  { slug: "spendings", icon: LayoutGrid },
  { slug: "reserves", icon: Coins },
  { slug: "settings", icon: Settings },
];

export function BdpTabs({
  locale,
  budgetId,
  reservesEnabled = true,
  initialTasks,
}: BdpTabsProps) {
  const pathname = usePathname() ?? "";
  const t = useTranslations("bdp.tab");

  // Warm every tab's primary data on budget open so all four tabs render
  // offline after a reopen — not just the one the user happened to land on.
  usePrefetchBudgetTabs(budgetId);

  // Warm every tab's RSC into the App Router cache on budget open (ONLINE) so the
  // FIRST soft-nav to each pill is INSTANT (reused for staleTimes.dynamic=120s)
  // instead of a per-pill server RSC roundtrip ("waiting for server" on the first
  // visit). The default in-viewport Link prefetch only PARTIALLY prefetches a
  // force-dynamic route; an explicit router.prefetch warms the full RSC and is
  // reliable on iOS (where in-viewport prefetch is flaky). Offline → no-op (nav
  // is a hard reload served from the SW doc cache, already instant).
  const router = useRouter();
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const slugs = reservesEnabled
      ? ["wallets", "spendings", "reserves", "settings"]
      : ["wallets", "spendings", "settings"];
    for (const slug of slugs) {
      router.prefetch(`/${locale}/budgets/${budgetId}/${slug}`);
    }
  }, [router, locale, budgetId, reservesEnabled]);

  const { data: tasks } = useQuery({
    queryKey: ["tasks", budgetId, "pending"],
    initialData: initialTasks ?? [],
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/tasks?status=pending`,
      );
      if (!res.ok) return initialTasks ?? [];
      const body = (await res.json()) as { tasks: TaskSummary[] };
      return body.tasks;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const countsByPill: Record<Pill, number> = {
    wallets: 0,
    spendings: 0,
    reserves: 0,
    settings: 0,
  };
  for (const task of tasks ?? []) {
    countsByPill[pillFor(task.kind)] += 1;
  }

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
          <NavLink
            key={slug}
            href={href}
            // Full prefetch (not the partial auto-prefetch a force-dynamic route
            // gets by default) so the soft-nav reuses the cached RSC — instant.
            prefetch
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={cn(
              "relative inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] px-4 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]",
              "min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0",
              active
                ? "text-[var(--on-primary)] text-sm font-semibold"
                : "text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body-on-dark)]",
            )}
          >
            {/* Sliding yellow pill (260618): a single shared-layout element that
                framer glides between pills as the active tab changes — buttery,
                transform-based, on live DOM. Sits BEHIND the icon/label. */}
            {active && (
              <motion.span
                layoutId="bdp-pill"
                aria-hidden="true"
                className="absolute inset-0 z-0 rounded-[var(--radius-pill)] bg-[var(--primary)]"
                // Match the page slide duration (page-transition.tsx). The
                // layoutId pill glide is a single shared element — robust to
                // rapid taps (no pane pile-up), unlike the old two-pane page
                // carousel that this rewrite replaced.
                transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
              />
            )}
            <Icon className="relative z-10 size-[18px]" aria-hidden="true" />
            {/* Label only on the active pill (mobile). */}
            <span
              className={cn(
                "relative z-10",
                active ? "inline" : "hidden sm:inline",
              )}
            >
              {label}
            </span>
            <span className="relative z-10">
              <PillBadge count={countsByPill[slug]} />
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
