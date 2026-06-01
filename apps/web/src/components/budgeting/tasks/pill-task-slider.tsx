"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
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
 * Tasks-Redesign §4: filters the shared ["tasks", budgetId, "pending"] React
 * Query result by the current pill's kind set (kind-pill-map). Returns null
 * when filtered list is empty (D-PH3-14 DOM rule, applied per-pill).
 *
 * Hybrid expand rule (Tasks-Redesign D7):
 *   - filtered.length === 1 → expanded on initial mount
 *   - filtered.length >= 2  → collapsed on initial mount
 *   - mid-session count changes do NOT auto-toggle (user owns state after mount)
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

  // Hybrid expand rule: derive INITIAL state from filtered.length captured at
  // first render. After mount, user owns the state — mid-session count changes
  // never auto-toggle.
  const [expanded, setExpanded] = useState(() => filtered.length === 1);

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
    <div
      data-testid="pill-task-slider"
      data-pill={pill}
      className="border-b border-[var(--hairline-dark)] bg-[var(--surface-card-dark)]"
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
        className="flex h-10 w-full items-center gap-2 px-4 text-sm text-[var(--body-on-dark)]"
      >
        <AlertCircle
          className="h-4 w-4 text-[var(--primary)]"
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
        <div role="list">
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
  );
}
