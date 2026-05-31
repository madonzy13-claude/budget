"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clientApiFetch } from "@/lib/budget-fetch";

/**
 * TaskBannerRow — single task row inside the expanded task banner.
 *
 * Phase 7 Plan 07-08 (D-PH7-25): the Phase-3 disabled action button is now
 * enabled and routes per-kind:
 *   - RESERVE_TOPUP          → router.push(/budgets/<id>/reserves?task=<id>)
 *   - CUSHION_BELOW_TARGET   → router.push(/budgets/<id>/wallets?task=<id>#cushion)
 *   - CONFIRM_DRAFT          → POST /recurring-rules/drafts/:id/confirm + optimistic
 *                              row collapse via onResolved (parent removes from list).
 *
 * Loading state (CONFIRM_DRAFT only): button is disabled + Loader2 spinner +
 * aria-busy="true" while the fetch is in flight.
 *
 * task.payload values are passed to t(...) as ICU interpolation parameters —
 * never rendered as raw JSX (T-03-06-03 / T-07-08-01 invariant preserved).
 * React's default text-node escaping protects against markup injection.
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
  /** Phase 7: optimistic collapse callback for CONFIRM_DRAFT (parent removes the task from local list). */
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
      // Invalid currency code — fall back to bare number.
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

export function TaskBannerRow({
  task,
  budgetId,
  onResolved,
}: TaskBannerRowProps) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const titleKey = `bdp.tasks.title.${task.kind}` as const;
  const kindKey = `bdp.tasks.kind.${task.kind}` as const;
  const actionKey = `bdp.tasks.action.${task.kind}.label` as const;
  const ariaLabelKey = `bdp.tasks.action.${task.kind}.ariaLabel` as const;
  const titleParams = buildTitleParams(task);

  async function handleAction() {
    switch (task.kind) {
      case "RESERVE_TOPUP":
        router.push(`/budgets/${budgetId}/reserves?task=${task.id}`);
        break;
      case "CUSHION_BELOW_TARGET":
        router.push(`/budgets/${budgetId}/wallets?task=${task.id}#cushion`);
        break;
      case "CONFIRM_DRAFT": {
        setPending(true);
        try {
          const draftId = task.payload?.draft_id as string | undefined;
          if (!draftId)
            throw new Error("Missing draft_id in CONFIRM_DRAFT payload");
          const res = await clientApiFetch(
            `/recurring-rules/drafts/${draftId}/confirm`,
            {
              method: "POST",
              headers: { "X-Budget-ID": budgetId },
            },
          );
          if (!res.ok) throw new Error(`Confirm failed: ${res.status}`);
          onResolved?.(task.id);
        } catch (e) {
          console.error("[task-banner-row] confirm draft failed:", e);
          toast.error(t("bdp.tasks.confirmError"));
        } finally {
          setPending(false);
        }
        break;
      }
    }
  }

  const isDeepLink =
    task.kind === "RESERVE_TOPUP" || task.kind === "CUSHION_BELOW_TARGET";

  return (
    <div
      role="listitem"
      className="flex h-12 items-center gap-3 border-b border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-4"
    >
      <span className="flex-1 truncate text-sm text-[var(--body-on-dark)]">
        {t(titleKey, titleParams)}
      </span>
      <Badge variant="secondary">{t(kindKey)}</Badge>
      <Button
        variant="primary"
        size="sm"
        onClick={handleAction}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={isDeepLink ? t(ariaLabelKey) : undefined}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          t(actionKey)
        )}
      </Button>
    </div>
  );
}
