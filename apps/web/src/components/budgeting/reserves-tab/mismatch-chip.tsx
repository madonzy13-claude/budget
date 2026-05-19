"use client";
/**
 * mismatch-chip.tsx — Three-variant reserve mismatch status chip.
 *
 * D-PH5-R12: overfunded + underfunded use --destructive border + text;
 *            reconciled uses --hairline-dark border + --muted-strong text.
 * Read-only this phase — no onClick, no tabIndex (Phase 7 may wire CTA).
 * role="status" so screen readers re-announce when variant changes.
 */
import * as React from "react";
import { AlertTriangle, Check } from "lucide-react";

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
  const isReconciled = variant === "reconciled";
  const Icon = isReconciled ? Check : AlertTriangle;

  const borderClass = isReconciled
    ? "border-[var(--hairline-dark)]"
    : "border-[var(--destructive)]";
  const amountColor = isReconciled
    ? "text-[var(--muted-strong)]"
    : "text-[var(--destructive)]";
  const helperColor = isReconciled
    ? "text-[var(--muted-strong)]"
    : "text-[var(--muted-foreground)]";

  const titleLabel = isReconciled ? "Reconciled" : (amountFormatted ?? "");

  return (
    <div
      data-testid={`mismatch-chip-${variant}`}
      role="status"
      className={[
        // UAT-PH5-T3-47: bigger chip — more padding inside the red
        // border so the amount + helper copy breathe. Doubles
        // vertical padding, widens horizontal padding, bumps gap.
        "inline-flex items-center gap-3 py-2 px-4",
        "rounded-[var(--radius-md)] border bg-transparent text-sm",
        borderClass,
      ].join(" ")}
    >
      <Icon className={`h-4 w-4 shrink-0 ${amountColor}`} aria-hidden={true} />
      <span className={`text-title-sm font-semibold ${amountColor}`}>
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
