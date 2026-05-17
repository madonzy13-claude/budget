"use client";
/**
 * column-header.tsx — 5-row category column header with grip + budget rows.
 *
 * D-PH4-D3: GripVertical always visible; touch-action:none on grip wrapper.
 * D-PH4-INT4: double-click on any cell is NO-OP (explicitly preventDefault).
 * D-PH4-INT1: Single click on name cell reveals [Pen] — no hover.
 */
import { useTranslations, useLocale } from "next-intl";
import { Pencil } from "lucide-react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import { useRevealActions } from "./reveal-actions";
import { centsToBare } from "@/lib/cents-format";
import { cn } from "@/lib/utils";
import { RowDragHandle } from "@/components/common/row-drag-handle";

export interface ColumnHeaderProps {
  category: {
    id: string;
    name: string;
    iconKey: string | null;
    colorKey: string | null;
    sortIndex: number;
  };
  summary: {
    plannedCents: string;
    cushionCents: string;
    activeBudgetCents: string;
    spentCents: string;
    reserveUsedCents: string;
    overspentCents: string;
    balanceCents: string;
  };
  cushionModeEnabled: boolean;
  dragGripProps?: DraggableSyntheticListeners;
  onEdit: (categoryId: string) => void;
  // D-PH5-R11 cascading-hide surface 2: when false, "Reserves used" row is hidden.
  // Default true preserves existing UX for all existing budgets.
  reservesEnabled?: boolean;
}

export function ColumnHeader({
  category,
  summary,
  cushionModeEnabled,
  dragGripProps = undefined,
  onEdit,
  reservesEnabled = true,
}: ColumnHeaderProps) {
  const t = useTranslations("grid.header");
  const locale = useLocale();
  const { revealed, setRevealed, ref } = useRevealActions();

  const balanceCents = BigInt(summary.balanceCents);
  const overspentCents = BigInt(summary.overspentCents);
  const reserveUsedCents = BigInt(summary.reserveUsedCents);
  // "Left" never shows negative — overspend is surfaced by the overspent row.
  const displayBalanceCents = balanceCents < 0n ? 0n : balanceCents;

  function handleDoubleClick(e: React.MouseEvent) {
    // D-PH4-INT4: NO-OP on category cells
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      data-testid={`column-header-${category.name.toLowerCase()}`}
      className="flex w-full flex-col"
    >
      {/* Row 1: Grip + Name + Pen (revealed on click) */}
      <div
        ref={ref}
        data-testid="column-header-name-cell"
        onClick={() => setRevealed(!revealed)}
        onDoubleClick={handleDoubleClick}
        className={cn(
          "flex min-h-[44px] items-center gap-1 px-2 py-2 cursor-pointer",
          "border-b border-[var(--hairline-dark)]",
          revealed && "bg-[var(--surface-elevated-dark)]",
        )}
      >
        {/* GripVertical — always visible, touch-none, D-PH4-D3 */}
        <RowDragHandle name={category.name} listeners={dragGripProps} />
        <span className="flex-1 truncate text-sm font-medium text-[var(--body-on-dark)]">
          {category.name}
        </span>
        {revealed && (
          <button
            type="button"
            data-testid={`column-header-pen-${category.name.toLowerCase()}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(category.id);
              setRevealed(false);
            }}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--surface-card-dark)]"
          >
            <Pencil
              className="h-3.5 w-3.5 text-[var(--body-on-dark)]"
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {/* Row 2: Planned / Cushion — NO double-click (D-PH4-INT4) */}
      <div
        onDoubleClick={handleDoubleClick}
        className="flex flex-col px-2 py-1.5 border-b border-[var(--hairline-dark)]"
      >
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {cushionModeEnabled ? t("row2.cushion") : t("row2.planned")}
        </span>
        <span className="text-sm font-medium tabular-nums text-[var(--body-on-dark)]">
          {centsToBare(
            cushionModeEnabled ? summary.cushionCents : summary.plannedCents,
            locale,
          )}
        </span>
      </div>

      {/* Row 3: Overspent */}
      <div
        onDoubleClick={handleDoubleClick}
        className="flex flex-col px-2 py-1.5 border-b border-[var(--hairline-dark)]"
      >
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {t("row3.overspent")}
        </span>
        <span
          data-testid={`column-header-${category.name.toLowerCase()}-overspent`}
          className={cn(
            "text-sm tabular-nums",
            overspentCents > 0n
              ? "text-[var(--destructive)]"
              : "text-[var(--muted-foreground)]",
          )}
        >
          {centsToBare(summary.overspentCents, locale)}
        </span>
      </div>

      {/* Row 4: Reserves used — hidden when reservesEnabled=false (D-PH5-R11 surface 2) */}
      {reservesEnabled && (
        <div
          onDoubleClick={handleDoubleClick}
          className="flex flex-col px-2 py-1.5 border-b border-[var(--hairline-dark)]"
        >
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {t("row4.reservesUsed")}
          </span>
          <span
            data-testid={`column-header-${category.name.toLowerCase()}-reserves-used`}
            className={cn(
              "text-sm tabular-nums",
              reserveUsedCents > 0n
                ? "text-[var(--body-on-dark)]"
                : "text-[var(--muted-foreground)]",
            )}
          >
            {centsToBare(summary.reserveUsedCents, locale)}
          </span>
        </div>
      )}

      {/* Row 5: Balance */}
      <div
        onDoubleClick={handleDoubleClick}
        className="flex flex-col px-2 py-1.5"
      >
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {t("row5.balance")}
        </span>
        <span
          data-testid={`column-header-${category.name.toLowerCase()}-balance`}
          className={cn(
            "text-sm font-semibold tabular-nums",
            displayBalanceCents > 0n
              ? "text-[var(--trading-up, #26a69a)]"
              : "text-[var(--muted-foreground)]",
          )}
        >
          {centsToBare(displayBalanceCents.toString(), locale)}
        </span>
      </div>
    </div>
  );
}
