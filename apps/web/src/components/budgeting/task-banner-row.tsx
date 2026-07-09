"use client";

import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { useCategories } from "@/hooks/use-budget-data";
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
  | "CUSHION_BELOW_TARGET"
  | "INCOME_UNDER_PLANNED";

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

function buildTitleParams(
  task: TaskSummary,
  locale: string,
  categoryName?: string,
): Record<string, string> {
  const payload = task.payload ?? {};
  const currency = (payload.currency as string) ?? "EUR";

  // Always format with the EN locale so the currency SYMBOL ($, €, £) shows —
  // not the ISO code. Intl in PL/UK renders USD as "563 USD"; "en" gives "$563"
  // (round 23 item 6; mirrors the overview cards). Compact: drops `.00` on whole
  // units, keeps 2 digits on fractions.
  function fmt(cents: unknown): string {
    if (cents === undefined || cents === null || cents === "") return "";
    try {
      const raw = typeof cents === "bigint" ? cents.toString() : String(cents);
      // Coerce numeric payloads ("5000.0", 5000) to a clean integer string so
      // BigInt() doesn't choke on a decimal point.
      const asNumber = Number(raw);
      if (!Number.isFinite(asNumber)) return "";
      const intStr = Math.trunc(asNumber).toString();
      return centsToDisplayCompact(intStr, currency, "en");
    } catch {
      return "";
    }
  }

  switch (task.kind) {
    case "RESERVE_TOPUP":
      return { amount: fmt(payload.shortfall_cents) };
    case "CONFIRM_DRAFT": {
      // Title: `Confirm {amount} — {category}` (amount first, NEVER the rule note —
      // round 23 item 7). Drops the "— {category}" tail when the category can't be
      // resolved (hasCategory drives the ICU select).
      const category = categoryName ?? "";
      return {
        ruleName: (payload.rule_name as string) ?? "", // detail text only
        category,
        hasCategory: category ? "yes" : "no",
        amount: fmt(payload.amount_cents),
      };
    }
    case "CUSHION_BELOW_TARGET":
      return { shortfall: fmt(payload.shortfall_cents) };
    case "INCOME_UNDER_PLANNED":
      return {
        shortfall: fmt(payload.shortfall_cents),
        income: fmt(payload.income_cents),
        available: fmt(payload.available_cents),
        planned: fmt(payload.planned_cents),
      };
  }
}

export function TaskBannerRow({ task, budgetId }: TaskBannerRowProps) {
  const t = useTranslations();
  const locale = useLocale();

  // Resolve the draft's category NAME from the budget's categories (the task
  // payload only carries category_id) so the CONFIRM_DRAFT title can read
  // "…in {category}". Works for existing tasks too (no re-emit).
  const categories = useCategories(budgetId).data ?? [];
  const categoryName =
    task.kind === "CONFIRM_DRAFT"
      ? categories.find((c) => c.id === (task.payload?.category_id as string))
          ?.name
      : undefined;

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
  const titleParams = buildTitleParams(task, locale, categoryName);
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
