"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  LayoutGrid,
  Coins,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clientApiFetch } from "@/lib/budget-fetch";
import { motion } from "motion/react";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";
import { PillBadge } from "@/components/budgeting/tasks/pill-badge";
import { pillFor } from "@/components/budgeting/tasks/kind-pill-map";
import type { BdpTab } from "@/lib/bdp-tabs";

/**
 * BdpTabs — pill tab bar for the Budget Detail Page.
 *
 * Pills are BUTTONS, not links: tab switching is pure client state owned by
 * <BudgetDetail> (no Next navigation, no per-tab RSC). The active pill comes from
 * the `activeTab` prop and `onSelect` flips it (BudgetDetail then pushState's the
 * URL + slides the carousel). Browser back/forward still works — BudgetDetail
 * mirrors popstate into `activeTab`, which re-highlights the pill here.
 *
 * Labels resolve from i18n via `t("bdp.tab.{slug}.label")`.
 */

interface BdpTabsProps {
  locale: string;
  budgetId: string;
  activeTab: BdpTab;
  onSelect: (tab: BdpTab) => void;
  // D-PH5-R11 cascading-hide surface 1: when false, Reserves pill is hidden.
  reservesEnabled?: boolean;
  // r36: when false, the Overview pill is hidden.
  overviewEnabled?: boolean;
  initialTasks?: TaskSummary[];
}

// Phase 11: Overview surfaced first — Overview → Wallets → Spendings → Reserves
// → Settings (mirrors TAB_ORDER). Overview carries no tasks (badge always 0).
const TABS: ReadonlyArray<{ slug: BdpTab; icon: LucideIcon }> = [
  { slug: "overview", icon: LayoutDashboard },
  { slug: "wallets", icon: Wallet },
  { slug: "spendings", icon: LayoutGrid },
  { slug: "reserves", icon: Coins },
  { slug: "settings", icon: Settings },
];

export function BdpTabs({
  locale,
  budgetId,
  activeTab,
  onSelect,
  reservesEnabled = true,
  overviewEnabled = true,
  initialTasks,
}: BdpTabsProps) {
  const t = useTranslations("bdp.tab");
  void locale;

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

  const countsByPill: Record<BdpTab, number> = {
    overview: 0,
    wallets: 0,
    spendings: 0,
    reserves: 0,
    settings: 0,
  };
  for (const task of tasks ?? []) {
    countsByPill[pillFor(task.kind)] += 1;
  }

  // D-PH5-R11: filter Reserves pill when reserves are disabled.
  // r36: filter Overview pill when the Overview page is disabled.
  const visibleTabs = TABS.filter(
    (tab) =>
      (reservesEnabled || tab.slug !== "reserves") &&
      (overviewEnabled || tab.slug !== "overview"),
  );

  return (
    <nav
      aria-label={t("aria")}
      className="flex h-12 items-center justify-center gap-1.5 overflow-x-auto px-4 sm:px-6"
    >
      {visibleTabs.map(({ slug, icon: Icon }) => {
        const active = slug === activeTab;
        const label = t(`${slug}.label`);
        return (
          <button
            key={slug}
            type="button"
            data-testid={`bdp-tab-${slug}`}
            onClick={() => onSelect(slug as BdpTab)}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={cn(
              "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] px-3 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]",
              "min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0",
              active
                ? "text-[var(--on-primary)] text-sm font-semibold"
                : "text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body-on-dark)]",
            )}
          >
            {/* Sliding yellow pill: a single shared-layout element that framer
                glides between pills as the active tab changes — transform-based,
                behind the icon/label. */}
            {active && (
              <motion.span
                layoutId="bdp-pill"
                aria-hidden="true"
                className="absolute inset-0 z-0 rounded-[var(--radius-pill)] bg-[var(--primary)]"
                transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
              />
            )}
            <Icon
              className="relative z-10 size-5 shrink-0"
              aria-hidden="true"
            />
            <span
              className={cn(
                "relative z-10",
                // Settings label overflowed the mobile pill row with all pills
                // present, so it's icon-only on mobile — BUT only while Reserves
                // is on. With Reserves off (one fewer pill = extra space) the
                // active Settings pill has room to show its label like the others.
                slug === "settings" && reservesEnabled
                  ? "hidden sm:inline"
                  : active
                    ? "inline"
                    : "hidden sm:inline",
              )}
            >
              {label}
            </span>
            {/* Badge only when there's a count — an always-present empty span left
                the `gap-1.5` in play, shoving the icon off-center on an icon-only
                pill (round 19 item 1: the settings circle). inline-flex items-center
                keeps the badge centered against the icon (was ~1px low otherwise). */}
            {countsByPill[slug] > 0 && (
              <span className="relative z-10 inline-flex items-center">
                <PillBadge count={countsByPill[slug]} />
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
