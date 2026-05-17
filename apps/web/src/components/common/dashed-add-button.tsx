"use client";
/**
 * dashed-add-button.tsx — Generalized dashed +Add button atom.
 *
 * D-PH5-E6: NOT yellow. Border-dashed with muted-foreground styling.
 * Generalized from Phase 4 add-category-column.tsx.
 * Accepts label, onClick, optional ariaLabel, testId, className override, Icon.
 */
import * as React from "react";
import { Plus } from "lucide-react";

export interface DashedAddButtonProps {
  onClick: () => void;
  label: string; // Already translated by caller
  ariaLabel?: string;
  testId?: string;
  className?: string; // Overrides default row-shape
  Icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

export function DashedAddButton({
  onClick,
  label,
  ariaLabel,
  testId,
  className,
  Icon = Plus,
}: DashedAddButtonProps) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  const defaultCls =
    "flex w-full min-h-[44px] flex-row items-center justify-center gap-2 " +
    "rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--muted-foreground)]/80 " +
    "bg-transparent hover:bg-[var(--secondary)]/40 hover:border-[var(--foreground)] " +
    "cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-offset-2 focus-visible:ring-[var(--info)] " +
    "text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]";

  return (
    <div
      data-testid={testId}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel ?? label}
      className={className ?? defaultCls}
    >
      <Icon className="h-4 w-4" aria-hidden={true} />
      <span>{label}</span>
    </div>
  );
}
