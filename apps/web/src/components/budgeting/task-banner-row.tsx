"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * TaskBannerRow — single task row inside the expanded task banner.
 *
 * Phase 3 ships the row SHAPE (kind chip + disabled action button) so Phase 7
 * can plug actions in without layout reflow. The action button is intentionally
 * disabled with aria-disabled="true" and a "Coming in Phase 7" tooltip.
 *
 * task.payload is NEVER rendered in Phase 3 (T-03-06-03). Only task.kind
 * (enum-bounded) and i18n keys flow to the DOM.
 */

export type TaskKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "STALE_WALLET"
  | "MONTH_END_REVIEW";

export interface TaskSummary {
  id: string;
  budget_id: string;
  kind: TaskKind;
  status: "PENDING" | "RESOLVED";
  payload: Record<string, unknown>;
  created_at: string;
}

interface TaskBannerRowProps {
  task: TaskSummary;
  budgetId: string;
  locale: string;
}

export function TaskBannerRow({ task }: TaskBannerRowProps) {
  const t = useTranslations();
  // Phase 3 falls back to key strings when Phase-7 catalogs are absent. The
  // i18n call returns the key when no translation exists — matches our test
  // mock which returns the raw key for unknown keys.
  const titleKey = `bdp.tasks.title.${task.kind}`;
  const kindKey = `bdp.tasks.kind.${task.kind}`;
  const actionKey = `bdp.tasks.action.${task.kind}.label`;
  return (
    <div
      role="listitem"
      className="flex h-12 items-center gap-3 border-b border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-4"
    >
      <span className="flex-1 truncate text-sm text-[var(--body-on-dark)]">
        {t(titleKey)}
      </span>
      <Badge variant="secondary">{t(kindKey)}</Badge>
      <Button
        variant="primary"
        size="sm"
        disabled
        aria-disabled="true"
        title={t("bdp.tasks.actionComingSoon")}
      >
        {t(actionKey)}
      </Button>
    </div>
  );
}
