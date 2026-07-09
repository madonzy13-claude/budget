"use client";
/**
 * app-badge.tsx — sets the PWA app-icon badge to the SUM of pending tasks across
 * ALL the user's budgets (r31 item 2). Uses the Badging API (installed PWA + secure
 * context); a silent no-op where unsupported. Reuses the already-cached
 * active-budgets list, so it costs no extra request. Renders nothing.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveBudgets } from "@/hooks/use-active-budgets";

/** A query-cache event that means a budget's PENDING task count just changed — the
 *  badge's `active-budgets` aggregate is now stale and must be refetched (r31 item 2:
 *  the badge didn't update after a task was solved). Only reacts to a settled
 *  (`success`) update of a `["tasks", <budgetId>, "pending"]` query. */
export function isPendingTasksUpdate(event: unknown): boolean {
  const e = event as {
    type?: string;
    action?: { type?: string };
    query?: { queryKey?: unknown };
  };
  const key = e?.query?.queryKey;
  return (
    e?.type === "updated" &&
    e?.action?.type === "success" &&
    Array.isArray(key) &&
    key[0] === "tasks" &&
    key[2] === "pending"
  );
}

export function AppBadge() {
  const { data } = useActiveBudgets();
  const qc = useQueryClient();

  // Whenever ANY budget's pending-tasks list settles (a task solved in-app, or a
  // background refetch found one added/removed), the active-budgets aggregate is
  // stale → refetch it so the badge follows. Centralised here instead of touching
  // every task-mutation hook.
  useEffect(() => {
    return qc.getQueryCache().subscribe((event) => {
      if (isPendingTasksUpdate(event)) {
        void qc.invalidateQueries({ queryKey: ["active-budgets"] });
      }
    });
  }, [qc]);

  useEffect(() => {
    if (data === undefined) return; // still loading — don't touch the badge yet
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator))
      return;
    const total = data.reduce((sum, b) => sum + (b.pendingTasksCount ?? 0), 0);
    if (total > 0) void navigator.setAppBadge(total).catch(() => {});
    else void navigator.clearAppBadge?.().catch(() => {});
  }, [data]);
  return null;
}
