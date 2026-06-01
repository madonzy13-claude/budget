"use client";
/**
 * add-category-column.tsx — Thin wrapper around DashedAddButton.
 *
 * D-PH4-D4: NOT draggable, NOT droppable. Constrained at far right.
 * D-PH4-S4: Single click opens CategorySlider create mode (via callback prop).
 * GRID-08: Add category trigger.
 *
 * Phase 5: Refactored to compose shared DashedAddButton atom.
 * Preserves Phase 4 visual behavior via column-shape className.
 */
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { DashedAddButton } from "@/components/common/dashed-add-button";

export interface AddCategoryColumnProps {
  onClick: () => void;
}

export function AddCategoryColumn({ onClick }: AddCategoryColumnProps) {
  const t = useTranslations("grid.addCategory");

  // UAT round 8: match normal category column width exactly
  // (w-[140px] sm:w-[160px] — see category-column.tsx). The longer
  // localized "Add category" labels (UK "Додати категорію", PL "Dodaj
  // kategorię") are allowed to wrap to two lines inside the box — that
  // is preferable to misaligning the column width and breaking the grid.
  // text-center keeps the wrapped label horizontally centered.
  const colClassName =
    "flex min-h-[170px] w-[140px] sm:w-[160px] flex-shrink-0 flex-col items-center justify-center gap-2 px-3 text-center " +
    "rounded-[var(--radius-lg)] border border-dashed border-[var(--muted-foreground)] cursor-pointer select-none " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)]";

  return (
    <DashedAddButton
      onClick={onClick}
      label={t("trigger")}
      ariaLabel={t("trigger")}
      testId="add-category-column"
      className={colClassName}
      Icon={Plus}
    />
  );
}
