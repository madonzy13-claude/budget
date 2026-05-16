"use client";
/**
 * add-category-column.tsx — Dashed + column at far right of grid.
 *
 * D-PH4-D4: NOT draggable, NOT droppable. Constrained at far right.
 * D-PH4-S4: Single click opens CategorySlider create mode (via callback prop).
 * GRID-08: Add category trigger.
 */
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

export interface AddCategoryColumnProps {
  onClick: () => void;
}

export function AddCategoryColumn({ onClick }: AddCategoryColumnProps) {
  const t = useTranslations("grid.addCategory");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      data-testid="add-category-column"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={t("trigger")}
      className="flex min-h-[170px] w-[140px] sm:w-[160px] flex-shrink-0 flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--muted-foreground)] cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--info)]"
    >
      <Plus
        className="h-6 w-6 text-[var(--muted-foreground)]"
        aria-hidden="true"
      />
      <span className="text-xs text-[var(--muted-foreground)]">
        {t("trigger")}
      </span>
    </div>
  );
}
