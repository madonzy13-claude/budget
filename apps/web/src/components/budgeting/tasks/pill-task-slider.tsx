"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import { clientApiFetch } from "@/lib/budget-fetch";
import {
  TaskBannerRow,
  type TaskSummary,
} from "@/components/budgeting/task-banner-row";
import {
  kindsFor,
  type Pill,
} from "@/components/budgeting/tasks/kind-pill-map";

/**
 * PillTaskSlider — per-pill task strip below the BDP pill bar.
 *
 * Tasks-Redesign §4 (UAT round 2):
 *   - Filters shared ["tasks", budgetId, "pending"] React Query by current pill.
 *   - Returns null when filtered list is empty (D-PH3-14 DOM rule, per-pill).
 *   - **Always starts collapsed** — even with one task. User explicitly opens.
 *   - Visual mirrors `SettingsAccordion`: rounded-xl card, hairline border,
 *     `--surface-card-dark` body, `#141920` content panel with inset top shadow
 *     when expanded.
 *   - Header icon: red Info circle (Tailwind/Lucide `Info` icon w/ trading-down
 *     color) — communicates attention, not urgency.
 *   - Mounted with small horizontal + top margin so the card breathes between
 *     pill bar and content.
 *
 * Row UX (deep-link / inline POST / sonner toast) is bit-identical to the
 * old TaskBanner — TaskBannerRow is reused unchanged.
 */
interface PillTaskSliderProps {
  budgetId: string;
  locale: string;
  pill: Pill;
  initialTasks: TaskSummary[];
}

export function PillTaskSlider({
  budgetId,
  locale,
  pill,
  initialTasks,
}: PillTaskSliderProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { data: tasks } = useQuery({
    queryKey: ["tasks", budgetId, "pending"],
    initialData: initialTasks,
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/tasks?status=pending`,
      );
      if (!res.ok) return initialTasks;
      const body = (await res.json()) as { tasks: TaskSummary[] };
      return body.tasks;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const allowedKinds = useMemo(() => new Set(kindsFor(pill)), [pill]);
  const filtered = useMemo(
    () => (tasks ?? []).filter((task) => allowedKinds.has(task.kind)),
    [tasks, allowedKinds],
  );

  // UAT round 2 (issue #5): always start collapsed. User must click to expand.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({
          queryKey: ["tasks", budgetId, "pending"],
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient, budgetId]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (filtered.length === 0) return null;

  const onResolved = (taskId: string) => {
    queryClient.setQueryData<TaskSummary[]>(
      ["tasks", budgetId, "pending"],
      (prev) => (prev ?? []).filter((task) => task.id !== taskId),
    );
  };

  const headerLabel =
    filtered.length === 1
      ? t("bdp.pillSlider.collapsedHeaderOne")
      : t("bdp.pillSlider.collapsedHeaderMany", { count: filtered.length });

  return (
    // Align the slider to the same centered column as the top-nav header
    // (logo→profile) and the BDP content: mx-auto max-w-[1280px] with the
    // header's px-4 sm:px-8 gutters. Previously full-viewport (px-3 sm:px-4),
    // which overhung the content column on desktop.
    <div className="mx-auto mt-3 w-full max-w-[1280px] px-4 sm:px-8">
      <div
        data-testid="pill-task-slider"
        data-pill={pill}
        className="overflow-hidden rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)]"
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? t("bdp.pillSlider.collapseAria")
              : t("bdp.pillSlider.expandAria")
          }
          className="flex h-11 w-full items-center gap-2 px-4 text-sm text-[var(--body-on-dark)] transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--info)]"
        >
          <Info
            className="h-4 w-4 text-[var(--trading-down)]"
            aria-hidden="true"
          />
          <span className="flex-1 text-left">{headerLabel}</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        {expanded ? (
          <div
            data-testid="pill-task-slider-rows"
            className="bg-[#141920] shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]"
          >
            {filtered.map((task) => (
              <TaskBannerRow
                key={task.id}
                task={task}
                budgetId={budgetId}
                locale={locale}
                onResolved={onResolved}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
