"use client";

import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { useCategories } from "@/hooks/use-budget-data";
import { scrollToDraft } from "@/lib/scroll-to-draft";
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

  // EN locale + narrow sign so the SHORT currency sign shows, not the ISO code:
  // "$563", "€563", and the suffix-convention signs "563 zł" / "563 kr" (PLN/SEK…)
  // instead of "PLN 563" (mirrors the overview cards). Compact: drops `.00` on
  // whole units, keeps 2 digits on fractions.
  function fmt(cents: unknown): string {
    if (cents === undefined || cents === null || cents === "") return "";
    try {
      const raw = typeof cents === "bigint" ? cents.toString() : String(cents);
      // Coerce numeric payloads ("5000.0", 5000) to a clean integer string so
      // BigInt() doesn't choke on a decimal point.
      const asNumber = Number(raw);
      if (!Number.isFinite(asNumber)) return "";
      const intStr = Math.trunc(asNumber).toString();
      return centsToDisplayCompact(intStr, currency, "en", true);
    } catch {
      return "";
    }
  }

  switch (task.kind) {
    case "RESERVE_TOPUP":
      return { amount: fmt(payload.shortfall_cents) };
    case "CONFIRM_DRAFT": {
      // Title: `Confirm {amount} ({ruleName})` — amount first, then the
      // scheduled payment that produced the draft, which is how the row is
      // labelled in the grid. Still NEVER the rule NOTE (round 23 item 7).
      //
      // Falls back to the category when the payment has no name, so the
      // parenthesised half is either useful or absent — never "( )".
      const label = (payload.rule_name as string) || categoryName || "";
      return {
        ruleName: label,
        hasRule: label ? "yes" : "no",
        amount: fmt(payload.amount_cents),
      };
    }
    case "CUSHION_BELOW_TARGET":
      return { shortfall: fmt(payload.shortfall_cents) };
    // 260731: projection-based — the same figures as the Overview Surplus card.
    case "INCOME_UNDER_PLANNED":
      return {
        shortfall: fmt(payload.shortfall_cents),
        low: fmt(payload.projected_low_cents),
      };
  }
}

/**
 * useTaskTitle — the localized task title + its component amount strings.
 * Extracted so the all-budgets aggregate banner can render the SAME full task
 * message (not a generic kind label) with its amounts individually maskable.
 * `amounts` are the formatted money substrings inside the title, for callers
 * that mask each one (privacy) by splitting the title on them.
 */
export function useTaskTitle(task: TaskSummary, budgetId: string) {
  const t = useTranslations();
  const locale = useLocale();

  // Resolve the draft's category NAME from the budget's categories (the task
  // payload only carries category_id) — the CONFIRM_DRAFT title falls back to
  // it when the scheduled payment has no name of its own.
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
  const amounts = [
    titleParams.amount,
    titleParams.shortfall,
    titleParams.income,
    titleParams.available,
    titleParams.planned,
  ].filter((a): a is string => !!a);

  return { t, title, detailKey, titleParams, amounts };
}

/**
 * The title, with the part that identifies a draft turned into a jump button.
 *
 * Only the "{amount} ({ruleName})" run is the target — "Confirm " stays plain
 * text so the row does not read as one long link, and so the button's
 * accessible name is the thing being jumped to.
 *
 * The split is on the RENDERED title rather than on ICU tags: `title` is also
 * the dialog heading and is consumed by the all-budgets aggregate banner, both
 * of which want a plain string. Keeping one message and slicing it here means
 * the three locales stay ordinary strings a translator can move around — the
 * only requirement is that "{amount} ({ruleName})" survives as one run, which
 * the i18n test pins.
 */
function TaskTitleText({
  task,
  title,
  titleParams,
}: {
  task: TaskSummary;
  title: string;
  titleParams: Record<string, string>;
}) {
  const draftId = task.payload?.draft_id as string | undefined;
  const jump =
    task.kind === "CONFIRM_DRAFT" && draftId && titleParams.hasRule === "yes"
      ? `${titleParams.amount} (${titleParams.ruleName})`
      : undefined;
  const at = jump ? title.indexOf(jump) : -1;

  // No draft id, no category or rule to name, or a translation that broke the
  // run apart: render the plain title rather than an unclickable fake link.
  if (!jump || at < 0) return <>{title}</>;

  return (
    <>
      {title.slice(0, at)}
      <button
        type="button"
        onClick={() => scrollToDraft(draftId!)}
        className="underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      >
        {jump}
      </button>
      {title.slice(at + jump.length)}
    </>
  );
}

export function TaskBannerRow({ task, budgetId }: TaskBannerRowProps) {
  const { t, title, detailKey, titleParams } = useTaskTitle(task, budgetId);

  return (
    <div
      role="listitem"
      data-task-id={task.id}
      data-task-kind={task.kind}
      className="flex min-h-12 items-center gap-3 border-b border-[var(--hairline-on-dark)] px-4 py-2 last:border-b-0"
    >
      <span className="flex-1 truncate text-sm text-[var(--body-on-dark)]">
        <TaskTitleText task={task} title={title} titleParams={titleParams} />
      </span>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-[var(--primary)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
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
