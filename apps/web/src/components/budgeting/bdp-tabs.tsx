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
  const visibleTabs = reservesEnabled
    ? TABS
    : TABS.filter((tab) => tab.slug !== "reserves");

  return (
    <nav
      aria-label={t("aria")}
      className="flex h-12 items-center justify-center gap-2 px-4 sm:px-6"
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
              "relative inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] px-4 transition-colors",
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
            <Icon className="relative z-10 size-[18px]" aria-hidden="true" />
            <span
              className={cn(
                "relative z-10",
                active ? "inline" : "hidden sm:inline",
              )}
            >
              {label}
            </span>
            {/* inline-flex items-center: without it the wrapper keeps the
                inherited line-height leading, which drops the badge ~1px below
                the icon/label center (UAT alignment). */}
            <span className="relative z-10 inline-flex items-center">
              <PillBadge count={countsByPill[slug]} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
