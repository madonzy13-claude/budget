"use client";
/**
 * mismatch-chip.tsx — Three-variant reserve mismatch status chip.
 *
 * UAT-PH5-T3-56: visually distinct overfunded vs underfunded so the
 * suggested action reads at a glance.
 *   - overfunded → amber --warning border/icon/amount, ArrowDownToLine
 *     icon (suggest reducing the wallet), "+" sign prefix.
 *   - underfunded → red --destructive border/icon/amount, ArrowUpFromLine
 *     icon (suggest topping up), "−" sign prefix.
 *   - reconciled → muted hairline border, Check icon, "Reconciled" label.
 *
 * D-PH5-R12 superseded for color: variants now differ by color so the
 * user sees direction without reading the helper text.
 * Read-only this phase — no onClick, no tabIndex.
 * role="status" so screen readers re-announce when variant changes.
 */
import * as React from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check } from "lucide-react";
import { useTranslations } from "next-intl";

export type MismatchVariant = "overfunded" | "underfunded" | "reconciled";

export interface MismatchChipProps {
  variant: MismatchVariant;
  amountFormatted?: string;
  helperText?: string;
}

export function MismatchChip({
  variant,
  amountFormatted,
  helperText,
}: MismatchChipProps) {
  const t = useTranslations("bdp.tab.reserves.mismatch");
  const isReconciled = variant === "reconciled";
  const isOverfunded = variant === "overfunded";

  // UAT-PH5-T3-56: icon mirrors the imbalance.
  //   overfunded   → ArrowUpFromLine: line at bottom = baseline reserves,
  //                  arrow rises ABOVE it (excess sitting in wallet).
  //   underfunded  → ArrowDownToLine: arrow on top, line at bottom,
  //                  arrow drops onto the baseline (signal: top-up
  //                  the wallet up to the line of required reserves).
  const Icon = isReconciled
    ? Check
    : isOverfunded
      ? ArrowUpFromLine
      : ArrowDownToLine;

  const accent = isReconciled
    ? "var(--muted-strong)"
    : isOverfunded
      ? "var(--warning)"
      : "var(--destructive)";

  const borderClass = isReconciled
    ? "border-[var(--hairline-dark)]"
    : isOverfunded
      ? "border-[var(--warning)]"
      : "border-[var(--destructive)]";

  const helperColor = isReconciled
    ? "text-[var(--muted-strong)]"
    : "text-[var(--muted-foreground)]";

  const sign = isReconciled ? "" : isOverfunded ? "+" : "−";

  const titleLabel = isReconciled
    ? t("reconciled.title")
    : amountFormatted
      ? `${sign}${amountFormatted}`
      : "";

  return (
    <div
      data-testid={`mismatch-chip-${variant}`}
      role="status"
      className={[
        "inline-flex items-center gap-3 py-2 px-4",
        "rounded-[var(--radius-md)] border bg-transparent text-sm",
        borderClass,
      ].join(" ")}
    >
      <Icon
        className="h-4 w-4 shrink-0"
        style={{ color: accent }}
        aria-hidden={true}
      />
      <span
        className="whitespace-nowrap text-title-sm font-semibold"
        style={{ color: accent }}
      >
        {titleLabel}
      </span>
      {helperText && (
        <span className={`text-caption leading-tight ${helperColor}`}>
          {helperText}
        </span>
      )}
    </div>
  );
}
