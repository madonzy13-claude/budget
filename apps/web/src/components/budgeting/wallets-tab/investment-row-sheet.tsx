"use client";
/**
 * investment-row-sheet.tsx — Interactive wrapper around <InvestmentRow> (Phase 9).
 *
 * Owns the dnd-kit sortable binding (drag handle only — Pitfall 2, prevents the
 * tap-expand / long-press-drag collision) and the mobile swipe-to-reveal
 * Swap · Edit panel (13.1 D-05 — no asset delete; entries are deleted in the
 * L3 ledger). Both bubble up to the section's sheets.
 *
 * The native-pointer swipe is useSwipeReveal (wallet-row.tsx's proven
 * gesture, shared with the ledger rows); its offset is reported up so the
 * open L3 ledger slides with the row.
 */
import type { CurrencyPL } from "@/hooks/use-fx-rates";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpDown, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import { useSwipeReveal } from "@/hooks/use-swipe-reveal";
import type { HoldingDto } from "@/hooks/use-investments";
import { InvestmentRow } from "./investment-row";

interface InvestmentRowSheetProps {
  holding: HoldingDto;
  /** A grouped child — renders a touch darker (D-#7). */
  nested?: boolean;
  /** Dim in place — this row's group is being dragged as a block; the lifted copy
   *  lives in the section's DragOverlay (UAT #1). */
  ghost?: boolean;
  /** Longest formatted amount in the section → dynamic amount-column width. */
  maxAmountChars?: number;
  onEdit: (holding: HoldingDto) => void;
  /** 13.1: open the Swap sheet (Buy / Sell / Transfer) for this asset. */
  onSwap?: (holding: HoldingDto) => void;
  /** Hide the asset (R6, user: was Archive; no confirm, history stays). */
  onArchive?: (holding: HoldingDto) => void;
  /** R6 (user): a hidden asset's row offers Unhide instead of Hide. */
  onUnhide?: (holding: HoldingDto) => void;
  /** R6 (user): the asset in another currency (passed to the row). */
  currencyPick?: { value: string; onChange: (currency: string) => void };
  converted?: CurrencyPL;
  /** Round 4: an asset with nothing but its opening entry is deleted, not
   *  archived — the section passes this only for such an asset. */
  onDelete?: (holding: HoldingDto) => void;
  /** The row opened/closed (the section renders the L3 ledger). */
  onToggle?: (id: string, open: boolean) => void;
  open?: boolean;
  /** R6-6: this asset's realized (type-summary `holdings`). */
  realized?: { realizedBudgetCents: string; soldCostBudgetCents: string };
  /** Swipe offset (px, ≤ 0) of this row — the section moves its ledger too. */
  onSwipeOffset?: (id: string, px: number, live: boolean) => void;
  /** Save an inline-edited value (manual-value holdings only — see InvestmentRow). */
  onValueChange?: (amount: string) => Promise<void> | void;
}

// Three 56px buttons (Swap · Edit · Archive) + two 12px gaps + a 12px lead gap.
const ACTION_W = 204;

export function InvestmentRowSheet({
  holding,
  nested,
  ghost,
  maxAmountChars,
  onEdit,
  onSwap,
  onArchive,
  onUnhide,
  currencyPick,
  converted,
  onDelete,
  onToggle,
  open,
  realized,
  onSwipeOffset,
  onValueChange,
}: InvestmentRowSheetProps) {
  const t = useTranslations("budget.investments");

  const wrapperRef = useRef<HTMLDivElement>(null);
  const {
    offset,
    swiping,
    close: closeSwipe,
  } = useSwipeReveal(wrapperRef, ACTION_W, {
    // 13.1 UAT 5: the open ledger strip slides with its asset.
    onOffset: (px, live) => onSwipeOffset?.(holding.id, px, live),
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: holding.id,
    // A hidden asset sits outside the sortable list.
    disabled: !!onUnhide,
    // Don't animate the post-drop layout change. The reorder comes from React
    // Query (the DOM order changes on drop); if @dnd-kit also animates the
    // transform-reset, the drop-neighbour renders at (new slot + leftover drag
    // transform) for a frame then slides to 0 → the "jump up then settle". With
    // this off, the transform→DOM handoff is instant, so the row that's already
    // visually in place simply stays there (D-#dnd-jump).
    animateLayoutChanges: () => false,
  });

  const swipeTransform = `translateX(${offset}px)`;
  const dndTransform = CSS.Transform.toString(transform) ?? "";

  return (
    // The SORTABLE node is the flex-child wrapper (D-#3): the @dnd-kit reorder
    // transform must move the laid-out element so siblings open a drop gap and
    // animate — when the transform sat on an inner div the list froze. The swipe
    // translateX lives on the inner content div so only the row slides over the
    // (absolute) action panel.
    <div
      ref={(node) => {
        setNodeRef(node);
        wrapperRef.current = node;
      }}
      className={[
        "relative",
        // 13.1-19: the section indents the asset block (row + ledger) under
        // its type header; the darker `nested` surface marks the level too.
        // Lift above siblings while dragging (z) / HIDE when this row's group is
        // dragged as a block (ghost → opacity-0). The cohesive copy lives in the
        // DragOverlay; a dimmed in-place child slid independently of its header and
        // left a broken remnant (UAT #3). The visible lift (ring + shadow + rounded)
        // lives on the INNER card below — on this wrapper it would enclose the
        // indent padding + rail, drawing the ring left of the actual row (UAT).
        isDragging ? "z-50" : ghost ? "opacity-0" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-investment-row-wrapper={holding.id}
      style={{
        transform:
          dndTransform && dndTransform !== "none" ? dndTransform : undefined,
        transition: swiping ? "none" : transition,
      }}
    >
      {/* Mobile swipe-revealed Edit · + (new transaction) panel (sm:hidden,
          R6-4: + second). */}
      <div
        aria-hidden={offset === 0}
        style={{
          opacity: Math.min(1, Math.abs(offset) / ACTION_W),
          pointerEvents: offset === 0 ? "none" : "auto",
          transition: swiping ? "none" : "opacity 200ms ease-out",
        }}
        className="absolute right-0 top-0 bottom-0 flex items-stretch gap-3 sm:hidden"
      >
        {/* Separate rounded buttons (sell + edit + delete) with empty space
            between them — mirrors the wallets swipe button style (D-#swipe).
            Sell is neutral (not green/red): red is reserved for destructive. */}
        <button
          type="button"
          data-no-swipe
          data-testid={`holding-swipe-edit-${holding.id}`}
          aria-label={`${t("asset.swipe.edit")} ${holding.name}`}
          tabIndex={offset === 0 ? -1 : 0}
          onClick={() => {
            closeSwipe();
            onEdit(holding);
          }}
          className="flex w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
        >
          <Pencil className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-no-swipe
          data-testid={`investment-swap-${holding.id}`}
          aria-label={`${t("asset.swipe.newTxn")} ${holding.name}`}
          tabIndex={offset === 0 ? -1 : 0}
          onClick={() => {
            closeSwipe();
            onSwap?.(holding);
          }}
          className="flex w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--info)] text-white"
        >
          <ArrowUpDown className="h-5 w-5" aria-hidden="true" />
        </button>
        {onUnhide ? (
          <button
            type="button"
            data-no-swipe
            data-testid={`investment-unhide-${holding.id}`}
            aria-label={t("asset.hidden.unhideAria", { name: holding.name })}
            tabIndex={offset === 0 ? -1 : 0}
            onClick={() => {
              closeSwipe();
              onUnhide(holding);
            }}
            className="flex w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--warning)] text-[var(--warning-foreground)]"
          >
            <Eye className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : onDelete ? (
          <button
            type="button"
            data-no-swipe
            data-testid={`investment-delete-${holding.id}`}
            aria-label={t("ledger.confirm.last.confirm")}
            tabIndex={offset === 0 ? -1 : 0}
            onClick={() => {
              closeSwipe();
              onDelete(holding);
            }}
            className="flex w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--destructive)] text-white"
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            data-no-swipe
            data-testid={`investment-hide-${holding.id}`}
            aria-label={t("asset.archive.aria", { name: holding.name })}
            tabIndex={offset === 0 ? -1 : 0}
            onClick={() => {
              closeSwipe();
              onArchive?.(holding);
            }}
            className="flex w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--warning)] text-[var(--warning-foreground)]"
          >
            <EyeOff className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        className={
          isDragging
            ? "rounded-[var(--radius-md)] opacity-95 shadow-lg ring-1 ring-[var(--info-ring)]"
            : ""
        }
        style={{
          transform: swipeTransform,
          transition: swiping ? "none" : undefined,
        }}
      >
        <InvestmentRow
          holding={holding}
          nested={nested}
          maxAmountChars={maxAmountChars}
          dragHandle={
            <RowDragHandle
              name={holding.name || "holding"}
              listeners={listeners}
              attributes={attributes}
              ariaLabel={t("row.dragAria", { name: holding.name })}
            />
          }
          onEdit={() => onEdit(holding)}
          onSwap={onSwap ? () => onSwap(holding) : undefined}
          onArchive={
            onArchive && !onDelete && !onUnhide
              ? () => onArchive(holding)
              : undefined
          }
          onUnhide={onUnhide ? () => onUnhide(holding) : undefined}
          currencyPick={currencyPick}
          converted={converted}
          onDelete={onDelete && !onUnhide ? () => onDelete(holding) : undefined}
          onToggle={onToggle}
          open={open}
          realized={realized}
          onValueChange={onValueChange}
        />
      </div>
    </div>
  );
}
