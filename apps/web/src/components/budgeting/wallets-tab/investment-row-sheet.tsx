"use client";
/**
 * investment-row-sheet.tsx — Interactive wrapper around <InvestmentRow> (Phase 9).
 *
 * Owns the dnd-kit sortable binding (drag handle only — Pitfall 2, prevents the
 * tap-expand / long-press-drag collision), the mobile swipe-to-reveal Edit +
 * Delete panel (D-19 — extends the wallet Delete-only swipe to Edit + Delete for
 * holdings without touching wallet-row), and the archive confirm dialog. Edit
 * bubbles up to the section's single <HoldingSheet>; Delete archives optimistically.
 *
 * The native-pointer swipe mirrors wallet-row.tsx's proven gesture handling
 * (passive:false so preventDefault works mid-swipe; iOS-safe).
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import type { HoldingDto } from "@/hooks/use-investments";
import { InvestmentRow } from "./investment-row";
import { HoldingDeleteConfirm } from "./holding-delete-confirm";

interface InvestmentRowSheetProps {
  holding: HoldingDto;
  onEdit: (holding: HoldingDto) => void;
  onArchive: (holdingId: string) => void;
}

// Two 44px action buttons + a little slack.
const ACTION_W = 96;

export function InvestmentRowSheet({
  holding,
  onEdit,
  onArchive,
}: InvestmentRowSheetProps) {
  const t = useTranslations("budget.investments");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const prevConfirmRef = useRef(false);
  useEffect(() => {
    if (prevConfirmRef.current && !confirmOpen) {
      if (offsetRef.current !== 0) setOffset(0);
    }
    prevConfirmRef.current = confirmOpen;
  }, [confirmOpen]);

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

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: holding.id });

  const swipeTransform = `translateX(${offset}px)`;
  const dndTransform = CSS.Transform.toString(transform) ?? "";
  const combinedTransform =
    dndTransform && dndTransform !== "none"
      ? `${dndTransform} ${swipeTransform}`
      : swipeTransform;

  return (
    <div
      ref={wrapperRef}
      className="relative"
      data-investment-row-wrapper={holding.id}
    >
      {/* Mobile swipe-revealed Edit + Delete panel (sm:hidden). */}
      <div
        aria-hidden={offset === 0}
        style={{
          opacity: Math.min(1, Math.abs(offset) / ACTION_W),
          pointerEvents: offset === 0 ? "none" : "auto",
          transition: swiping ? "none" : "opacity 200ms ease-out",
        }}
        className="absolute right-0 top-0 bottom-0 flex items-stretch rounded-[var(--radius-md)] sm:hidden"
      >
        <button
          type="button"
          data-no-swipe
          data-testid={`holding-swipe-edit-${holding.id}`}
          aria-label={t("row.editAria", { name: holding.name })}
          tabIndex={offset === 0 ? -1 : 0}
          onClick={() => {
            setOffset(0);
            onEdit(holding);
          }}
          className="flex w-11 items-center justify-center bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          data-no-swipe
          data-testid={`holding-swipe-delete-${holding.id}`}
          aria-label={t("row.deleteAria", { name: holding.name })}
          tabIndex={offset === 0 ? -1 : 0}
          onClick={() => setConfirmOpen(true)}
          className="flex w-11 items-center justify-center rounded-r-[var(--radius-md)] bg-[var(--destructive)] text-white"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        style={{
          transform: combinedTransform,
          transition: swiping ? "none" : transition,
          visibility: isDragging ? "hidden" : undefined,
        }}
      >
        <InvestmentRow
          holding={holding}
          dragHandle={
            <RowDragHandle
              name={holding.name || "holding"}
              listeners={listeners}
              attributes={attributes}
              ariaLabel={t("row.dragAria", { name: holding.name })}
            />
          }
          onEdit={() => onEdit(holding)}
          onDelete={() => setConfirmOpen(true)}
        />
      </div>

      <HoldingDeleteConfirm
        name={holding.name}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          onArchive(holding.id);
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}
