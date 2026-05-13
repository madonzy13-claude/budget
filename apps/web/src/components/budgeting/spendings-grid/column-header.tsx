"use client";
/**
 * column-header.tsx — 5-row category column header with grip + budget rows.
 *
 * D-PH4-D3: GripVertical always visible; touch-action:none on grip wrapper.
 * D-PH4-INT4: double-click on any cell is NO-OP (explicitly preventDefault).
 * D-PH4-INT1: Single click on name cell reveals [Pen] — no hover.
 */
import { useTranslations, useLocale } from "next-intl";
import { GripVertical, Pencil } from "lucide-react";
import { useRevealActions } from "./reveal-actions";
import { centsToDisplay } from "@/lib/cents-format";
import { cn } from "@/lib/utils";

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
  budgetCurrency: string;
  dragGripProps?: Record<string, unknown>;
  onEdit: (categoryId: string) => void;
}

export function ColumnHeader({
  category,
  summary,
  cushionModeEnabled,
  budgetCurrency,
  dragGripProps = {},
  onEdit,
}: ColumnHeaderProps) {
  const t = useTranslations("grid.header");
  const locale = useLocale();
  const { revealed, setRevealed, ref } = useRevealActions();

  const balanceCents = BigInt(summary.balanceCents);
  const overspentCents = BigInt(summary.overspentCents);
  const reserveUsedCents = BigInt(summary.reserveUsedCents);

  function handleDoubleClick(e: React.MouseEvent) {
    // D-PH4-INT4: NO-OP on category cells
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      data-testid={`column-header-${category.name.toLowerCase()}`}
      className="flex w-[160px] flex-col border-r border-[var(--hairline-dark)]"
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
        <span
          data-testid="column-header-grip"
          style={{ touchAction: "none" }}
          className="touch-none cursor-grab text-[var(--muted-foreground)]"
          {...dragGripProps}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="flex-1 truncate text-sm font-medium text-[var(--body-on-dark)]">
          {category.name}
        </span>
        {revealed && (
          <button
            type="button"
            data-testid="column-header-edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(category.id);
              setRevealed(false);
            }}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--surface-card-dark)]"
          >
            <Pencil className="h-3.5 w-3.5 text-[var(--body-on-dark)]" aria-hidden="true" />
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
          {centsToDisplay(
            cushionModeEnabled ? summary.cushionCents : summary.plannedCents,
            budgetCurrency,
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
          className={cn(
            "text-sm tabular-nums",
            overspentCents > 0n
              ? "text-[var(--destructive)]"
              : "text-[var(--muted-foreground)]",
          )}
        >
          {centsToDisplay(summary.overspentCents, budgetCurrency, locale)}
        </span>
      </div>

      {/* Row 4: Reserves used */}
      <div
        onDoubleClick={handleDoubleClick}
        className="flex flex-col px-2 py-1.5 border-b border-[var(--hairline-dark)]"
      >
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {t("row4.reservesUsed")}
        </span>
        <span
          className={cn(
            "text-sm tabular-nums",
            reserveUsedCents > 0n
              ? "text-[var(--body-on-dark)]"
              : "text-[var(--muted-foreground)]",
          )}
        >
          {centsToDisplay(summary.reserveUsedCents, budgetCurrency, locale)}
        </span>
      </div>

      {/* Row 5: Balance */}
      <div
        onDoubleClick={handleDoubleClick}
        className="flex flex-col px-2 py-1.5"
      >
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {t("row5.balance")}
        </span>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            balanceCents > 0n
              ? "text-[var(--trading-up, #26a69a)]"
              : balanceCents < 0n
                ? "text-[var(--destructive)]"
                : "text-[var(--muted-foreground)]",
          )}
        >
          {centsToDisplay(summary.balanceCents, budgetCurrency, locale)}
        </span>
      </div>
    </div>
  );
}
