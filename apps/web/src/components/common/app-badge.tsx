"use client";
/**
 * app-badge.tsx — sets the PWA app-icon badge to the SUM of pending tasks across
 * ALL the user's budgets (r31 item 2). Uses the Badging API (installed PWA + secure
 * context); a silent no-op where unsupported. Reuses the already-cached
 * active-budgets list, so it costs no extra request. Renders nothing.
 */
import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveBudgets } from "@/hooks/use-active-budgets";
import { useBadgePrefs } from "@/lib/badge-prefs";

/** Sum of pending tasks across budgets the user OPTED IN to the app-icon badge
 *  (r37). The badge is opt-in: a budget counts ONLY when `enabled[id] === true`;
 *  missing / false contributes nothing. Pure for unit testing. */
export function sumBadgeCount(
  budgets: { id: string; pendingTasksCount?: number }[],
  enabled: Record<string, boolean>,
): number {
  return budgets.reduce(
    (sum, b) =>
      sum + (enabled[b.id] === true ? (b.pendingTasksCount ?? 0) : 0),
    0,
  );
}

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

  // 260721: per-DEVICE app-icon badge opt-in — read from localStorage (the settings
  // Badge toggle writes it). A budget's pending count is on the icon only when THIS
  // device opted in (badgePrefs[id] === true); two phones can differ. `{}` until
  // mounted (SSR-safe), then the device's real choices.
  const badgePrefs = useBadgePrefs();

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

  const applyBadge = useCallback(() => {
    if (data === undefined) return; // still loading — don't touch the badge yet
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator))
      return;
    const total = sumBadgeCount(data, badgePrefs);
    if (total > 0) void navigator.setAppBadge(total).catch(() => {});
    else void navigator.clearAppBadge?.().catch(() => {});
  }, [data, badgePrefs]);

  useEffect(() => {
    applyBadge();
  }, [applyBadge]);

  // iOS only repaints the Home-Screen icon badge when the PWA goes to the
  // background — a foreground setAppBadge() often doesn't show until then. Re-apply
  // on visibility/pagehide so the count actually lands on the icon.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const reapply = () => applyBadge();
    document.addEventListener("visibilitychange", reapply);
    window.addEventListener("pagehide", reapply);
    return () => {
      document.removeEventListener("visibilitychange", reapply);
      window.removeEventListener("pagehide", reapply);
    };
  }, [applyBadge]);

  return null;
}
