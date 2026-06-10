"use client";
/**
 * column-header.tsx — 5-row category column header with grip + budget rows.
 *
 * D-PH4-D3: GripVertical always visible; touch-action:none on grip wrapper.
 * D-PH4-INT4: double-click on any cell is NO-OP (explicitly preventDefault).
 * D-PH4-INT1: Single click on name cell reveals [Pen] — no hover.
 */
import { useTranslations, useLocale } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
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
    reserveAvailableCents: string;
    reserveExcluded?: boolean;
    overspentCents: string;
    balanceCents: string;
  };
  cushionModeEnabled: boolean;
  dragGripProps?: DraggableSyntheticListeners;
  onEdit: (categoryId: string) => void;
  // D-PH5-R11 cascading-hide surface 2: when false, "Reserves used" row is hidden.
  // Default true preserves existing UX for all existing budgets.
  reservesEnabled?: boolean;
  /** Archived "keep history" — the category is read-only: the edit pen is
   *  replaced by a red permanent-delete trash. */
  archived?: boolean;
  /** Called when the archived column's trash is clicked → confirm + hard delete. */
  onPermanentDelete?: (categoryId: string) => void;
}

export function ColumnHeader({
  category,
  summary,
  cushionModeEnabled,
  dragGripProps = undefined,
  onEdit,
  reservesEnabled = true,
  archived = false,
  onPermanentDelete,
}: ColumnHeaderProps) {
  const t = useTranslations("grid.header");
  const locale = useLocale();
  const { revealed, setRevealed, ref } = useRevealActions();

  const balanceCents = BigInt(summary.balanceCents);
  const overspentCents = BigInt(summary.overspentCents);
  const reserveUsedCents = BigInt(summary.reserveUsedCents);
  // When the category is excluded from reserves NOW, the "available" side is a dash.
  const reserveExcluded = summary.reserveExcluded ?? false;
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
      {/* Row 1: Grip + Name + Pen.
          UAT round 20: cell itself uses the default cursor; pointer
          lives only on the pen button (it's the actual click target).
          Background no longer highlights on click — that visual signal
          belonged to the click-to-reveal model. Desktop reveals the
          pen on hover via `group-hover:opacity-100`; touch keeps the
          click-to-reveal via `revealed` state (no visual cell bg
          change, just the pen fades in). */}
      <div
        ref={ref}
        data-testid="column-header-name-cell"
        onClick={() => setRevealed(!revealed)}
        onDoubleClick={handleDoubleClick}
        className={cn(
          // w-0 min-w-full = "fill the column but don't drive its width":
          // a long category name truncates instead of widening the column.
          // Only the Reserves row (row 4) stays intrinsic, so it alone
          // decides how wide the column grows.
          "group flex w-0 min-w-full min-h-[44px] items-center gap-1 px-2 py-2",
          "border-b border-[var(--hairline-dark)]",
        )}
      >
        {/* GripVertical — always visible, touch-none, D-PH4-D3 */}
        <RowDragHandle name={category.name} listeners={dragGripProps} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--body-on-dark)]">
          {category.name}
        </span>
        {/* "archived" tag — inline + shrink-0 so the row stays single-line and
            aligned with every other column's name row. */}
        {archived && (
          <span className="shrink-0 rounded bg-[var(--surface-elevated-dark)] px-1 py-0.5 text-[9px] lowercase tracking-wider text-[#7A7C7F]">
            {t("archived")}
          </span>
        )}
        {/* Archived categories are read-only — no edit pen. */}
        {!archived && (
          <button
            type="button"
            data-testid={`column-header-pen-${category.name.toLowerCase()}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(category.id);
              setRevealed(false);
            }}
            className={cn(
              // UAT round 22: pen sized h-7/w-7 + icon h-4/w-4 to match
              // the transaction-row pen, so the affordance reads the same
              // weight in the category header as in the row chips.
              "flex h-7 w-7 items-center justify-center rounded cursor-pointer transition-opacity",
              "hover:bg-[var(--surface-elevated-dark)]",
              // Hidden by default; shown on desktop hover (group-hover) or
              // when the user has tapped to reveal on touch (revealed).
              revealed
                ? "opacity-100"
                : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto",
            )}
          >
            <Pencil
              className="h-4 w-4 text-[var(--body-on-dark)]"
              aria-hidden="true"
            />
          </button>
        )}
        {/* Archived → permanent-delete trash (replaces the edit pen). */}
        {archived && (
          <button
            type="button"
            data-testid={`column-header-trash-${category.name.toLowerCase()}`}
            onClick={(e) => {
              e.stopPropagation();
              onPermanentDelete?.(category.id);
            }}
            aria-label={`Delete ${category.name}`}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded cursor-pointer transition-opacity hover:bg-[var(--surface-elevated-dark)]",
              // Reveal on tap (revealed) or desktop hover (group-hover) — same
              // affordance as the edit pen on normal columns.
              revealed
                ? "opacity-100"
                : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto",
            )}
          >
            <Trash2
              className="h-4 w-4 text-[var(--destructive)]"
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
          {/* "used / available". whitespace-nowrap so a wide value (e.g.
              "10 456.87 / 15 456.45") widens the COLUMN instead of wrapping. When the
              category is excluded NOW: available is a dash (—); if it also used no
              reserve this month, the whole cell is a single dash. */}
          <span className="text-sm tabular-nums whitespace-nowrap">
            {reserveExcluded && reserveUsedCents === 0n ? (
              <span
                data-testid={`column-header-${category.name.toLowerCase()}-reserves-used`}
                className="text-[var(--muted-foreground)]"
              >
                —
              </span>
            ) : (
              <>
                {/* used (white when >0) */}
                <span
                  data-testid={`column-header-${category.name.toLowerCase()}-reserves-used`}
                  className={
                    reserveUsedCents > 0n
                      ? "text-[var(--body-on-dark)]"
                      : "text-[var(--muted-foreground)]"
                  }
                >
                  {centsToBare(summary.reserveUsedCents, locale)}
                </span>
                {/* " / available" (greyed) — always shown for included categories
                    (incl. "0 / 0"); a dash when the category is excluded now. */}
                <span
                  data-testid={`column-header-${category.name.toLowerCase()}-reserves-available`}
                  className="text-[var(--muted-foreground)]"
                >
                  {" / "}
                  {reserveExcluded
                    ? "—"
                    : centsToBare(summary.reserveAvailableCents ?? "0", locale)}
                </span>
              </>
            )}
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
