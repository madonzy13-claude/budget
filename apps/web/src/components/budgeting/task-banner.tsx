"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { clientApiFetch } from "@/lib/budget-fetch";
import {
  TaskBannerRow,
  type TaskSummary,
} from "@/components/budgeting/task-banner-row";

/**
 * TaskBanner — collapsed accordion banner showing pending tasks count.
 *
 * Contract (Plan 03-06 BDP-03):
 *   - RSC-initial + React Query 60s poll (D-PH3-13).
 *   - Banner is ABSENT from DOM when tasks.length === 0 (D-PH3-14).
 *   - Expanded view shows a `role="list"` of TaskBannerRow children.
 *   - Escape collapses; tab-revisible invalidates the query.
 *
 * Pitfall guard: clientApiFetch lives at @/lib/budget-fetch (not the .server.ts
 * sibling). It picks up the budget id from window.location automatically AND
 * is a same-origin fetch (cookies attach automatically — T-03-06-05).
 */

interface TaskBannerProps {
  budgetId: string;
  locale: string;
  initialTasks: TaskSummary[];
}

export function TaskBanner({
  budgetId,
  locale,
  initialTasks,
}: TaskBannerProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

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

  // Refresh on tab re-visible (D-PH3-13 companion path: visibility-driven invalidation).
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

  // Escape collapses while expanded (UI-SPEC §6 interaction contract).
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (!tasks || tasks.length === 0) return null;

  const accordionId = `task-banner-accordion-${budgetId}`;

  return (
    <div className="bg-[var(--surface-card-dark)]" data-testid="task-banner">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={accordionId}
        aria-label={t(
          expanded
            ? "bdp.tasks.banner.collapse.aria"
            : "bdp.tasks.banner.trigger.aria",
        )}
        className={[
          "flex h-12 w-full items-center gap-3 px-4",
          "hover:bg-[var(--surface-elevated-dark)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]",
        ].join(" ")}
      >
        <AlertCircle
          className="h-[18px] w-[18px] text-[var(--primary)]"
          aria-hidden="true"
        />
        <Badge variant="default">
          {t("bdp.tasks.count", { count: tasks.length })}
        </Badge>
        <span className="flex-1" />
        {expanded ? (
          <ChevronUp
            className="h-4 w-4 text-[var(--muted-foreground)]"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            className="h-4 w-4 text-[var(--muted-foreground)]"
            aria-hidden="true"
          />
        )}
      </button>
      {expanded ? (
        <div
          id={accordionId}
          role="list"
          className="max-h-[40vh] overflow-y-auto border-t border-[var(--hairline-dark)]"
        >
          {tasks.map((task) => (
            <TaskBannerRow
              key={task.id}
              task={task}
              budgetId={budgetId}
              locale={locale}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
