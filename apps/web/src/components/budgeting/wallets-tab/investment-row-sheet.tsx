"use client";
/**
 * investment-row-sheet.tsx — Interactive wrapper around <InvestmentRow> (Phase 9).
 *
 * Owns the dnd-kit sortable binding (drag handle only — Pitfall 2, prevents the
 * tap-expand / long-press-drag collision) and the mobile swipe-to-reveal
 * Swap · Edit panel (13.1 D-05 — no asset delete; entries are deleted in the
 * L3 ledger). Both bubble up to the section's sheets.
 *
 * The native-pointer swipe mirrors wallet-row.tsx's proven gesture handling
 * (passive:false so preventDefault works mid-swipe; iOS-safe).
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightLeft, Pencil } from "lucide-react";
import { RowDragHandle } from "@/components/common/row-drag-handle";
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
  /** The row opened/closed (the section renders the L3 ledger). */
  onToggle?: (id: string, open: boolean) => void;
  open?: boolean;
  /** Save an inline-edited value (manual-value holdings only — see InvestmentRow). */
  onValueChange?: (amount: string) => Promise<void> | void;
}

// Two 56px buttons (Swap · Edit) + the 12px gap between them + a 12px lead gap.
const ACTION_W = 136;

export function InvestmentRowSheet({
  holding,
  nested,
  ghost,
  maxAmountChars,
  onEdit,
  onSwap,
  onToggle,
  open,
  onValueChange,
}: InvestmentRowSheetProps) {
  const t = useTranslations("budget.investments");

  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const state = { x: 0, y: 0, base: 0, locked: false, pid: -1 };

    const isInteractive = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      if (node.closest("[data-no-swipe]")) return true;
      if (node.closest('[data-testid^="drag-grip-"]')) return true;
      return false;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      if (isInteractive(e.target)) return;
      state.x = e.clientX;
      state.y = e.clientY;
      state.base = offsetRef.current;
      state.locked = false;
      state.pid = e.pointerId;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (state.pid !== e.pointerId) return;
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      if (!state.locked) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          state.pid = -1;
          return;
        }
        state.locked = true;
        setSwiping(true);
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* best-effort */
        }
      }
      if (e.cancelable) e.preventDefault();
      setOffset(Math.max(-ACTION_W, Math.min(0, state.base + dx)));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (state.pid !== e.pointerId) return;
      if (state.locked) {
        const finalOffset = offsetRef.current <= -ACTION_W / 2 ? -ACTION_W : 0;
        setOffset(finalOffset);
        setSwiping(false);
        suppressClickUntilRef.current = Date.now() + 400;
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* best-effort */
        }
      }
      state.x = 0;
      state.y = 0;
      state.base = 0;
      state.locked = false;
      state.pid = -1;
    };

    const onClickCapture = (e: MouseEvent) => {
      if (Date.now() < suppressClickUntilRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: holding.id,
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
        // Grouped child: indent + a continuous left rail. The flat list has no
        // nested container to carry a `border-l`, so each child draws its own 1px
        // rail via a ::before that extends up into the gap-2 above it (−top-2),
        // joining the header's rail through to the last child (D-#flat-rail). Kept
        // while dragging too: a grouped child reordered in place must keep its
        // indent (matching its slot geometry) or the in-group reorder gap can't
        // animate and the row reads as un-nested (UAT).
        nested
          ? "ml-3 pl-3 before:absolute before:left-0 before:-top-2 before:bottom-0 before:w-px before:bg-[var(--hairline-dark)] before:content-['']"
          : "",
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
      {/* Mobile swipe-revealed Swap · Edit panel (sm:hidden). */}
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
          data-testid={`investment-swap-${holding.id}`}
          aria-label={`${t("asset.swipe.swap")} ${holding.name}`}
          tabIndex={offset === 0 ? -1 : 0}
          onClick={() => {
            setOffset(0);
            onSwap?.(holding);
          }}
          className="flex w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
        >
          <ArrowRightLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-no-swipe
          data-testid={`holding-swipe-edit-${holding.id}`}
          aria-label={`${t("asset.swipe.edit")} ${holding.name}`}
          tabIndex={offset === 0 ? -1 : 0}
          onClick={() => {
            setOffset(0);
            onEdit(holding);
          }}
          className="flex w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
        >
          <Pencil className="h-5 w-5" aria-hidden="true" />
        </button>
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
          onToggle={onToggle}
          open={open}
          onValueChange={onValueChange}
        />
      </div>
    </div>
  );
}
