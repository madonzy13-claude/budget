"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * TaskBannerRow — single passive task row inside the per-pill slider.
 *
 * Tasks-Redesign UAT round 2 (issues #3 + #4):
 *   - Read-only: NOT clickable, no navigation, no inline action. The pill
 *     badge already routes the user to the right pill; the slider explains
 *     what is wrong. The user fixes the problem through the existing pill
 *     surfaces (Reserves table, Wallets cushion lane, Spendings drafts).
 *   - Always-visible "More" trigger opens a dialog with longer, kind-specific
 *     guidance pulled from i18n: `bdp.tasks.detail.<KIND>`.
 *   - No ChevronRight, no Loader2 — nothing that suggests the row itself
 *     resolves the issue.
 *
 * task.payload values are passed to t(...) as ICU interpolation parameters —
 * never rendered as raw JSX (T-03-06-03 / T-07-08-01 invariant preserved).
 */

export type TaskKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "CUSHION_BELOW_TARGET";

export interface TaskSummary {
  id: string;
  budget_id: string;
  kind: TaskKind;
  status: "PENDING" | "RESOLVED";
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TaskBannerRowProps {
  task: TaskSummary;
  budgetId: string;
  locale: string;
  /**
   * Kept on the prop API for source-compatibility with the prior contract —
   * the row no longer triggers inline resolution, but PillTaskSlider still
   * supplies the optimistic-resolve callback so a future inline surface can
   * pick it up without an upstream change.
   */
  onResolved?: (taskId: string) => void;
}

function buildTitleParams(task: TaskSummary): Record<string, string> {
  const payload = task.payload ?? {};
  const currency = (payload.currency as string) ?? "EUR";

  function fmt(cents: unknown): string {
    if (cents === undefined || cents === null || cents === "") return "";
    const n = Number(cents);
    if (!Number.isFinite(n)) return "";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(n / 100);
    } catch {
      return String(n / 100);
    }
  }

  switch (task.kind) {
    case "RESERVE_TOPUP":
      return { amount: fmt(payload.shortfall_cents) };
    case "CONFIRM_DRAFT":
      return {
        ruleName: (payload.rule_name as string) ?? "",
        amount: fmt(payload.amount_cents),
      };
    case "CUSHION_BELOW_TARGET":
      return { shortfall: fmt(payload.shortfall_cents) };
  }
}

export function TaskBannerRow({ task }: TaskBannerRowProps) {
  const t = useTranslations();

  // RESERVE_TOPUP carries a `direction` of "TOPUP" or "WITHDRAW" in payload
  // (recompute-reserve-topup-task.ts:125). The WITHDRAW direction needs a
  // different title + guidance text because the user's options are different
  // (withdraw the surplus vs. top up a wallet).
  const directionSuffix =
    task.kind === "RESERVE_TOPUP" && task.payload?.direction === "WITHDRAW"
      ? "_withdraw"
      : "";
  const titleKey = `bdp.tasks.title.${task.kind}${directionSuffix}` as const;
  const detailKey = `bdp.tasks.detail.${task.kind}${directionSuffix}` as const;
  const titleParams = buildTitleParams(task);
  const title = t(titleKey, titleParams);

  return (
    <div
      role="listitem"
      data-task-id={task.id}
      data-task-kind={task.kind}
      className="flex min-h-12 items-center gap-3 border-b border-[var(--hairline-on-dark)] px-4 py-2 last:border-b-0"
    >
      <span className="flex-1 truncate text-sm text-[var(--body-on-dark)]">
        {title}
      </span>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-[var(--primary)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
          >
            {t("bdp.tasks.more")}
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--body-on-dark)] whitespace-pre-line">
            {t(detailKey, titleParams)}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
