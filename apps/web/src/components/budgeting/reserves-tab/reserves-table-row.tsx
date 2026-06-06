"use client";
/**
 * reserves-table-row.tsx — row for the Reserves tab (NEW engine model).
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md) + 05-19 column reshape: an
 * active row renders ONE editable "Available" value (R, `reserveCents`). The
 * per-row Used (U) cell is REMOVED — the Σ of usedCents now renders once in the
 * totals footer (TOTAL USED). The old Expected/Actual/Share% triple and the
 * underfunded red-share logic are also GONE.
 *
 * UAT-PH5-T3-55:
 *   - Actions column dropped (no MoreHorizontal placeholder).
 *   - Mobile swipe-left reveals "Exclude" (active rows) / "Restore"
 *     (excluded rows). Mirrors the wallet-row swipe-to-delete gesture
 *     and lives behind the row's opaque background. DnD still works:
 *     the drag handle (data-testid="drag-grip-*") opts out of the swipe
 *     pointer listener via `isInteractive`.
 *   - Excluded rows render NAME ONLY — no available value.
 *
 * T-05-05: InlineEditCell disabled={true} on Excluded rows — click is a no-op.
 * T-05-10: category name rendered as plain JSX text — React auto-escapes.
 *
 * W-5 contract: data-category-id on every row for downstream plan consumers.
 */
import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { useTranslations, useLocale } from "next-intl";
// Plan 07-08 D-PH7-26: PencilLine indicator for rows that contribute to a
// pending RESERVE_TOPUP task.
import { PencilLine } from "lucide-react";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import { Input } from "@/components/ui/input";
import { centsToBare } from "@/lib/cents-format";
import type { ReservesSummaryRow } from "@/hooks/use-reserves-summary";

export interface ReservesTableRowProps {
  row: ReservesSummaryRow;
  currency: string;
  isExcluded: boolean;
  onUpdate: (newCents: bigint) => Promise<void>;
  /** UAT-PH5-T3-55: invoked when the mobile swipe-action button is tapped. */
  onSwipeAction?: () => void;
  /**
   * Plan 07-08 D-PH7-26: when a PENDING RESERVE_TOPUP task references this
   * budget, the parent passes the task id here so the row renders a PencilLine
   * indicator next to the category name. Clicking it triggers the existing
   * inline reserve-balance edit cell (no new modal). The icon is hidden when
   * the prop is undefined to preserve the Phase 5 layout.
   */
  pendingTaskId?: string;
}

export function ReservesTableRow({
  row,
  isExcluded,
  onUpdate,
  onSwipeAction,
  pendingTaskId,
}: ReservesTableRowProps) {
  const t = useTranslations("bdp.tab.reserves.row");
  const locale = useLocale();
  // Plan 07-08: separate top-level `reserves` namespace for the indicator's
  // aria-label (key `reserves.actions.editBalance`).
  const tRoot = useTranslations();
  // Plan 07-08: imperative path into the InlineEditCell — happy-dom + jsdom
  // both honor HTMLElement.click(), so we look up the cell by data-testid
  // (already wired in the existing InlineEditCell render) and dispatch.
  const handleEditPenClick = React.useCallback(() => {
    if (typeof document === "undefined") return;
    const cell = document.querySelector<HTMLElement>(
      `[data-testid="reserves-balance-${row.categoryId}"]`,
    );
    cell?.click();
  }, [row.categoryId]);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: row.categoryId,
    });

  // ─── Mobile swipe-left action (UAT-PH5-T3-55) ────────────────────────────
  // UAT round 7: bumped from 88 → 120 so longer localized swipe labels
  // ("Виключити" / "Відновити" — 9 chars in UK, "Wykluczyć" / "Przywrócić"
  // in PL) fit inside the action cell without truncation on mobile.
  const ACTION_W = 120;
  const [offset, setOffset] = React.useState(0);
  const [swiping, setSwiping] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const offsetRef = React.useRef(0);
  const suppressClickUntilRef = React.useRef(0);

  React.useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const state = { x: 0, y: 0, base: 0, locked: false, pid: -1 };

    const isInteractive = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      if (node.closest('[data-editing="true"]')) return true;
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

  const rowClass = [
    "flex min-h-[48px] items-center gap-3 rounded-[var(--radius-md)]",
    "px-3 sm:min-h-[48px] min-h-[56px]",
    // UAT round 10/11: excluded rows use a darker surface (#14181D) plus a
    // muted #7A7C7F text/icon color so the row reads as visually muted
    // while every glyph stays fully legible.
    isExcluded
      ? "bg-[#14181D] text-[#7A7C7F] [&_svg]:text-[#7A7C7F]"
      : "bg-[var(--surface-card-dark)] hover:bg-[var(--surface-elevated-dark)]",
  ]
    .filter(Boolean)
    .join(" ");

  const swipeTransform = `translateX(${offset}px)`;
  const dndTransform = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
    : "";
  const combinedTransform =
    dndTransform && dndTransform !== ""
      ? `${dndTransform} ${swipeTransform}`
      : swipeTransform;

  const swipeCta = isExcluded ? t("swipeRestoreCta") : t("swipeExcludeCta");
  const swipeAria = isExcluded
    ? t("restoreAria", { name: row.name })
    : t("excludeAria", { name: row.name });

  return (
    <div
      ref={wrapperRef}
      className="relative"
      data-reserve-row-wrapper={row.categoryId}
    >
      <button
        data-testid={`reserves-swipe-action-${row.categoryId}`}
        data-no-swipe
        aria-label={swipeAria}
        aria-hidden={offset === 0}
        tabIndex={offset === 0 ? -1 : 0}
        onClick={() => {
          // Snap row back before mutating; toggle handler invalidates
          // the query so the row re-renders in its new section.
          setOffset(0);
          onSwipeAction?.();
        }}
        style={{
          opacity: Math.min(1, Math.abs(offset) / ACTION_W),
          pointerEvents: offset === 0 ? "none" : "auto",
          transition: swiping ? "none" : "opacity 200ms ease-out",
        }}
        className={[
          // UAT round 9: button now offset 8 px from the right edge so a
          // visible gap appears between the swiped row's right edge and the
          // action button's left edge. The row still slides ACTION_W=120
          // pixels, but the button itself occupies only the right-most
          // 112 px of that range (right-2 + w-[112px]). Net = 8 px gap.
          "absolute right-2 top-0 bottom-0 flex w-[112px] items-center justify-center px-2",
          "rounded-[var(--radius-md)]",
          isExcluded
            ? "bg-[var(--info)] text-[var(--info-foreground,white)]"
            : "bg-[var(--destructive)] text-white",
          "text-body-md font-medium",
          "cursor-pointer sm:hidden",
        ].join(" ")}
      >
        {swipeCta}
      </button>
      <div
        ref={setNodeRef}
        data-testid={`reserves-row-${row.categoryId}`}
        data-category-id={row.categoryId}
        style={{
          transform: combinedTransform,
          transition:
            swiping || isDragging ? "none" : "transform 200ms ease-out",
          // UAT-PH5-T3-63 (revised): elevate ONLY the moving row, on the
          // draggable element itself — not the wrapper. Putting z-index
          // on the wrapper creates a parent stacking context that wraps
          // the absolute swipe button too, which made dnd-kit's pointer
          // capture and auto-scroll laggy. position:relative is required
          // for z-index to apply on a non-positioned element.
          ...(isDragging ? { position: "relative" as const, zIndex: 50 } : {}),
        }}
        className={rowClass}
      >
        <RowDragHandle
          name={row.name}
          listeners={listeners}
          attributes={attributes}
        />

        {/* Category name — plain JSX, React auto-escapes (T-05-10).
            Plan 07-08 D-PH7-26: when this row contributes to a pending
            RESERVE_TOPUP task, render a PencilLine icon inline that triggers
            the existing balance inline-edit cell. The icon is absent (no DOM
            node) when pendingTaskId is undefined to preserve the Phase 5
            layout. */}
        <div
          className={[
            "min-w-0 flex-1 truncate text-sm",
            // UAT round 12: excluded rows render the category name in the
            // muted neutral #7A7C7F so it reads as visually inactive while
            // still legible. Active rows keep --foreground.
            isExcluded ? "text-[#7A7C7F]" : "text-[var(--foreground)]",
          ].join(" ")}
        >
          <span className="inline-flex items-center gap-2">
            <span className="truncate">{row.name}</span>
            {pendingTaskId ? (
              <button
                type="button"
                data-no-swipe
                data-pending-task-id={pendingTaskId}
                data-testid={`reserves-pending-edit-${row.categoryId}`}
                onClick={handleEditPenClick}
                aria-label={tRoot("reserves.actions.editBalance")}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--muted)] hover:text-[var(--body-on-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--info-ring)]"
              >
                <PencilLine className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </div>

        {/* Excluded rows render name-only (UAT-PH5-T3-55) — no available value.
            05-19: the per-row Used cell is removed; its sum lives in the footer
            (TOTAL USED). Active rows now show only the editable Available value. */}
        {!isExcluded && (
          // Available (R) — the single editable reserve value (renamed
          // "Reserve" → "Available" in 05-19; testId stays reserves-balance-*).
          // UAT-PH5-T3-57: pass the DECIMAL-DISPLAY string (e.g. "8") as
          // InlineEditCell value so the cell's equality check compares
          // decimal-vs-decimal. Earlier we passed the raw cents string "800",
          // which collided whenever the user typed the same digits as the cents
          // value (e.g. "8" with balance 800 → typing "800" matched draft →
          // InlineEditCell short-circuited as no-op and never fired onSave).
          <div className="w-[88px] text-right tabular-nums sm:w-[140px]">
            <InlineEditCell
              // value is the editor source — keep it a clean separator-free
              // decimal so the edit round-trip + no-op compare stay locale-
              // agnostic; the resting display below is locale-grouped.
              value={centsToBare(row.reserveCents).replace(/[^0-9.-]/g, "")}
              ariaLabel={t("reserveAria", { name: row.name })}
              disabled={false}
              testId={`reserves-balance-${row.categoryId}`}
              render={() => (
                <span className="text-num-md text-[var(--foreground)]">
                  {centsToBare(row.reserveCents, locale)}
                </span>
              )}
              renderEditor={(draft, onChange, _onCommit, onCancel) => (
                <Input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  defaultValue={String(draft).replace(/[^0-9.-]/g, "")}
                  onChange={(e) => onChange(e.target.value.replace(",", "."))}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") onCancel();
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                  className="h-9 pl-7 text-right"
                />
              )}
              onSave={async (v) => {
                const cleaned = String(v).replace(",", ".");
                const n = Number(cleaned || "0");
                const cents = BigInt(
                  Math.round((Number.isFinite(n) ? n : 0) * 100),
                );
                await onUpdate(cents);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
