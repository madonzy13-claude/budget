"use client";
/**
 * cushion-mode-chip.tsx — "this budget is running on its cushion limits".
 *
 * A budget in cushion mode looks identical to one that is not: the same cards
 * and rows, with different rules behind every figure — each category judged
 * against its cushion amount, and the cushion wallets counted as spendable. The
 * chip is the only thing that says so (user, 260904l).
 *
 * One component, three homes, so the three cannot drift apart:
 *   · the Cushion card on a budget's Overview — reading "Active", because the
 *     card already says which pot it is
 *   · each row of the all-budgets page, and the budget switcher's dropdown,
 *     where the name has to carry the state — reading "Cushion"
 *
 * The accent as a STATE marker rather than a new colour: cushion mode is
 * something the household turned on, not a warning, so it stays out of the
 * trading red/green that mean "you are short" everywhere else.
 */
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function CushionModeChip({
  variant = "name",
  className,
}: {
  /** "name" → "Cushion" (beside a budget's name). "state" → "Active" (inside
   *  the Cushion card, which already names the pot). */
  variant?: "name" | "state";
  className?: string;
}) {
  const t = useTranslations("budget.cushionMode");
  return (
    <span
      data-testid="cushion-mode-chip"
      className={cn(
        "inline-flex shrink-0 items-center rounded-[var(--radius-pill)] px-1.5 py-0.5",
        "text-[11px] font-semibold leading-tight",
        "bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)]",
        className,
      )}
    >
      {variant === "state" ? t("state") : t("name")}
    </span>
  );
}
