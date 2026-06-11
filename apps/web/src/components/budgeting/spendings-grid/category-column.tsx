"use client";
/**
 * category-column.tsx — Sortable category column wrapping ColumnHeader + rows + QuickEntryInput.
 *
 * D-PH4-D3: GripVertical touch-none; drag listeners scoped to grip only.
 * Sortable via @dnd-kit/sortable useSortable.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { ChevronUp } from "lucide-react";
import { ColumnHeader } from "./column-header";
import { TransactionRow } from "./transaction-row";
import { DraftRow } from "./draft-row";
import { QuickEntryInput } from "./quick-entry-input";
import type { TxnDTO } from "@/hooks/use-transactions";
import type { DraftDTO } from "@/hooks/use-drafts";
import { cn } from "@/lib/utils";

export interface SpendingsSummaryCategoryDTO {
  categoryId: string;
  name: string;
  iconKey: string | null;
  colorKey: string | null;
  sortIndex: number;
  plannedCents: string;
  cushionCents: string;
  activeBudgetCents: string;
  spentCents: string;
  reserveUsedCents: string;
  reserveAvailableCents: string;
  reserveExcluded?: boolean;
  /** Archived "keep history" — column greyed + read-only (no quick entry / edit). */
  archived?: boolean;
  overspentCents: string;
  balanceCents: string;
}

export interface CategoryColumnProps {
  category: {
    id: string;
    name: string;
    iconKey: string | null;
    colorKey: string | null;
    sortIndex: number;
  };
  summary: SpendingsSummaryCategoryDTO;
  cushionModeEnabled: boolean;
  budgetCurrency: string;
  transactions: TxnDTO[];
  drafts: DraftDTO[];
  gridScrolled?: boolean;
  budgetId: string;
  month: string;
  resolvedQuickEntryDate: string;
  // D-PH5-R11 cascading-hide surface 2: forwarded to ColumnHeader.
  reservesEnabled?: boolean;
  onEditTxn: (txId: string) => void;
  onEditDraft: (draftId: string) => void;
  onEditCategory: (categoryId: string) => void;
  /** Permanent-delete an archived category (trash on the column header). */
  onPermanentDelete?: (categoryId: string) => void;
  /** Revert (unarchive) an archived category — no confirm (260611-vuo). */
  onUnarchive?: (categoryId: string) => void;
}

export function CategoryColumn({
  category,
  summary,
  cushionModeEnabled,
  budgetCurrency,
  transactions,
  drafts,
  gridScrolled = false,
  budgetId,
  month,
  resolvedQuickEntryDate,
  reservesEnabled = true,
  onEditTxn,
  onEditDraft,
  onEditCategory,
  onPermanentDelete,
  onUnarchive,
}: CategoryColumnProps) {
  const tDraft = useTranslations("grid.draft");
  const tGrid = useTranslations("grid");
  // Archived "keep history": the column is read-only — no quick entry, no
  // category edit — and visually dimmed. Hidden entirely in future months
  // (filtered server-side), so this only renders for the months it still shows.
  const archived = summary.archived ?? false;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Archived "keep history" columns fade out (inline style wins over the
    // Tailwind opacity class, which the dragging opacity would otherwise clobber).
    opacity: isDragging ? 0.5 : archived ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`category-column-${category.id}`}
      {...attributes}
      // UAT round 18: `!cursor-default` (Tailwind `!`-prefix →
      // !important) is required because the global base rule
      // `[role="button"] { cursor: pointer !important }` would
      // otherwise win the cascade. dnd-kit's useSortable spreads
      // role="button" onto the sortable container, which the round-15
      // rule had been applying cursor:pointer across the whole column —
      // including the read-only summary rows (planned / overspent /
      // reserves-used / balance). Pinning with !important here makes
      // the summary cells read as non-interactive; the name-cell Row 1
      // re-applies cursor-pointer inside ColumnHeader.
      // w-max + min-w baseline: the column sits at the baseline width and
      // grows ONLY when the Reserves row ("10 456.87 / 15 456.45") needs it.
      // Every other element is w-0 min-w-full (fills but never drives width),
      // so a long name/note can't widen the column — only the reserve value can.
      className={cn(
        "w-max min-w-[140px] sm:min-w-[160px] flex flex-col flex-shrink-0 rounded-xl bg-[var(--surface-card-dark)] overflow-clip !cursor-default",
        // Archived "keep history": darker #14181D surface (same as excluded
        // reserve rows); the fade comes from the inline `opacity` above.
        archived && "!bg-[#14181D] text-[#7A7C7F]",
      )}
    >
      {/* Top backdrop. Pure-CSS, sticky-pinned at grid.top. Solid canvas-bg
          rectangle covering top 12px of the column (matches the rounded-xl
          radius). Renders ABOVE the column's surface bg + border (the mask
          is a positioned child = higher stacking layer) but BELOW the
          sticky band (z-10 vs this z-5). Result: at the column's visible
          top edge, the squared bg + vertical borders are hidden by this
          canvas-color band; the sticky band's own rounded-t-xl curve sits
          on top, painting surface inside the curve. Only ONE curve in play
          (sticky's), so no dual-curve anti-alias mismatch. No scroll
          handler — no scroll-tied repaint lag. */}
      <div
        aria-hidden="true"
        className="sticky top-0 pointer-events-none -mx-px -mt-px"
        style={{
          zIndex: 5,
          height: 12,
          marginBottom: -12,
          background: "var(--canvas-dark)",
        }}
      />

      {/* Sticky header band: the 5-row summary stack + quick-entry stays
          glued to the top of the grid's scroll container while transactions
          scroll vertically beneath. When the grid is scrolled, a shadow + a
          small chevron-up cue make the hidden-above content discoverable. */}
      <div
        data-testid={`column-sticky-${category.name.toLowerCase()}`}
        // touch-action: pan-x — touches on the header strip can still pan the
        // grid horizontally but cannot scroll the grid vertically. Vertical
        // scrolling only kicks in when the finger starts inside the
        // transaction list below.
        style={{ touchAction: "pan-x" }}
        className={cn(
          // border-x + border-t on the sticky band so when it pins at the
          // wrapper top (column's own top has scrolled out of the clip), the
          // rounded outline still reads as the column's rounded corners.
          "sticky top-0 z-10 bg-[var(--surface-card-dark)] rounded-t-xl border-x border-t border-[var(--border)] -mx-px -mt-px",
          archived && "!bg-[#14181D]",
          gridScrolled &&
            (transactions.length > 0 || drafts.length > 0) &&
            "shadow-[0_6px_8px_-4px_rgba(0,0,0,0.55)]",
        )}
      >
        <ColumnHeader
          category={category}
          summary={summary}
          cushionModeEnabled={cushionModeEnabled}
          dragGripProps={listeners ?? {}}
          onEdit={onEditCategory}
          reservesEnabled={reservesEnabled}
          archived={archived}
          onPermanentDelete={onPermanentDelete}
          onUnarchive={onUnarchive}
        />

        {/* w-0 min-w-full: the quick-entry input fills the column but its
            intrinsic width must not widen it (only the Reserves row may).
            Archived columns are read-only → no quick entry. */}
        {!archived && (
          <div className="w-0 min-w-full">
            <QuickEntryInput
              categoryId={category.id}
              categoryName={category.name}
              budgetId={budgetId}
              month={month}
              budgetCurrency={budgetCurrency}
              resolvedDate={resolvedQuickEntryDate}
            />
          </div>
        )}

        {/* Hidden-content indicator. grid-template-rows from 0fr→1fr is the
            canonical Tailwind height-animation trick: both directions
            transition smoothly (max-height animations glitch on iOS Safari
            when collapsing back to 0). Inner div uses overflow-hidden so the
            chevron clips during the roll. */}
        <div
          data-testid={`column-scrolled-indicator-${category.name.toLowerCase()}`}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
            // minmax(0,Xfr) — bare `0fr` won't collapse because fr has an
            // implicit `auto` minimum (= min-content); minmax(0,…) overrides
            // it so the row can actually shrink to 0.
            gridScrolled && (transactions.length > 0 || drafts.length > 0)
              ? "grid-rows-[minmax(0,1fr)] opacity-100"
              : "grid-rows-[minmax(0,0fr)] opacity-0",
          )}
          aria-hidden={!gridScrolled}
        >
          <div className="flex items-center justify-center overflow-hidden text-[var(--muted-foreground)]">
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Transaction list — both axes allowed: vertical drag scrolls the
          rows, horizontal drag pans the grid between categories.
          w-0 min-w-full: long notes/amounts truncate within the column
          instead of widening it (only the Reserves row drives width). */}
      <div className="flex flex-col gap-[var(--spacing-xs)] flex-1 w-0 min-w-full">
        {/* "expenses" section label — ONLY for archived columns, which have no
            quick-entry input (a normal column's quick-entry already carries this
            label). A top line separates it from the "left" summary row above. */}
        {archived && transactions.length > 0 && (
          // Matches the summary-row separators exactly: same 1px
          // `--hairline-dark` rule (ColumnHeader uses `border-b` of it). The
          // `mt-0.5` is load-bearing, NOT spacing: this border-top shares its
          // top edge pixel with the sticky header band (z-10, solid bg), which
          // paints OVER it and makes the line vanish. Nudging 2px down clears
          // the shared edge so the rule renders — while still scrolling under
          // the band normally (no z-index hack that would break the pinned
          // state). Pixel-verified identical to the planned/overspent rule
          // (mean row luminance 30.1, same as the summary separators).
          <div className="mt-0.5 border-t border-[var(--hairline-dark)] px-2 pt-1.5 pb-1.5 text-[10px] lowercase tracking-wide text-[var(--muted-foreground)]">
            {tGrid("expensesTitle")}
          </div>
        )}
        {transactions.map((t, i) => (
          <TransactionRow
            key={t.id}
            txn={t}
            budgetId={budgetId}
            month={month}
            onEdit={onEditTxn}
            readOnly={archived}
            // Round the bottom of the last confirmed row when drafts follow,
            // so the confirmed group reads as a closed group above the
            // draft section beneath.
            roundedBottom={i === transactions.length - 1 && drafts.length > 0}
          />
        ))}
        {/* Drafts section: the "TO CONFIRM" label sits on the column
            surface (no dark band) so it doesn't read as a tab boundary;
            only the row stack gets the darker `#181c22` lane to mark
            the pending region. The dark band still extends to the
            column bottom so the lane reads as a contiguous group. */}
        {drafts.length > 0 ? (
          <>
            <div className="mt-2 px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
              {tDraft("sectionTitle")}
            </div>
            <div
              className="flex flex-1 flex-col"
              style={{ backgroundColor: "#181c22" }}
            >
              {[...drafts]
                .sort((a, b) =>
                  a.transactionDate.localeCompare(b.transactionDate),
                )
                .map((d, i) => (
                  <DraftRow
                    key={d.id}
                    draft={d}
                    budgetId={budgetId}
                    month={month}
                    onEdit={onEditDraft}
                    topShadow={i === 0}
                    readOnly={archived}
                  />
                ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
