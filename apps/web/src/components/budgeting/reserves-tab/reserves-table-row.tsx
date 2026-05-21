"use client";
/**
 * reserves-table-row.tsx — 3-cell row for the Reserves tab.
 *
 * UAT-PH5-T3-55:
 *   - Actions column dropped (no MoreHorizontal placeholder).
 *   - Mobile swipe-left reveals "Exclude" (active rows) / "Restore"
 *     (excluded rows). Mirrors the wallet-row swipe-to-delete gesture
 *     and lives behind the row's opaque background. DnD still works:
 *     the drag handle (data-testid="drag-grip-*") opts out of the swipe
 *     pointer listener via `isInteractive`.
 *   - Excluded rows render NAME ONLY — no balance, no share dashes.
 *
 * T-05-05: InlineEditCell disabled={true} on Excluded rows — click is a no-op.
 * T-05-10: category name rendered as plain JSX text — React auto-escapes.
 * D-PH5-R4: em-dash logic on share column when walletSharePercent===null.
 * D-PH5-R10: Active rows render REAL reserveBalanceCents.
 *
 * W-5 contract: data-category-id on every row for downstream plan consumers.
 */
import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { useTranslations } from "next-intl";
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
}

export function ReservesTableRow({
  row,
  isExcluded,
  onUpdate,
  onSwipeAction,
}: ReservesTableRowProps) {
  const t = useTranslations("bdp.tab.reserves.row");
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: row.categoryId,
    });

  const sharePct = row.walletSharePercent;

  // ─── Mobile swipe-left action (UAT-PH5-T3-55) ────────────────────────────
  const ACTION_W = 88;
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
    "bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px] min-h-[56px]",
    isExcluded ? "opacity-50" : "hover:bg-[var(--surface-elevated-dark)]",
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
          "absolute right-0 top-0 bottom-0 flex w-20 items-center justify-center",
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

        {/* Category name — plain JSX, React auto-escapes (T-05-10) */}
        <div className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
          {row.name}
        </div>

        {/* Excluded rows render name-only (UAT-PH5-T3-55) — no balance, no share. */}
        {!isExcluded && (
          <>
            {/* Reserve balance ("Expected") — editable on Active.
                UAT-PH5-T3-57: pass the DECIMAL-DISPLAY string (e.g. "8")
                as InlineEditCell value so the cell's equality check
                compares decimal-vs-decimal. Earlier we passed the raw
                cents string "800", which collided whenever the user
                typed the same digits as the cents value (e.g. "8" with
                balance 800 → typing "800" matched draft → InlineEditCell
                short-circuited as no-op and never fired onSave). */}
            <div className="w-[72px] text-right tabular-nums sm:w-[120px]">
              <InlineEditCell
                value={centsToBare(row.reserveBalanceCents)}
                ariaLabel={`Reserve balance for ${row.name}`}
                disabled={false}
                testId={`reserves-balance-${row.categoryId}`}
                render={(v) => (
                  <span className="text-num-md text-[var(--foreground)]">
                    {v}
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

            {/* Actual amount cell. UAT-PH5-T3-60 split: amount + percent
                now in separate columns. UAT-PH5-T3-61: when builder
                returns null (no reserve wallets → sumActiveActual=0n),
                render literal 0 and 0% instead of em-dash so the user
                still sees a numeric baseline. UAT-PH5-T3-64: zero actual
                inherits the underfunded red colour when the row expects
                more than 0 cents — same rule as the populated branch
                (balanceCents > shareCents), so the deficit indicator
                survives the zero-wallet-pool collapse. */}
            <div className="w-[64px] text-right text-num-md sm:w-[100px]">
              {sharePct === null
                ? (() => {
                    const expected = BigInt(row.reserveBalanceCents);
                    const underfunded = expected > 0n;
                    return (
                      <span
                        className={
                          underfunded
                            ? "text-[var(--destructive)]"
                            : "text-[var(--foreground)]"
                        }
                        aria-label="Zero actual"
                      >
                        0
                      </span>
                    );
                  })()
                : (() => {
                    const balanceCents = BigInt(row.reserveBalanceCents);
                    const shareCents = BigInt(row.walletShareAmountCents!);
                    const underfunded = balanceCents > shareCents;
                    return (
                      <span
                        className={
                          underfunded ? "text-[var(--destructive)]" : undefined
                        }
                      >
                        {centsToBare(row.walletShareAmountCents!)}
                      </span>
                    );
                  })()}
            </div>

            {/* Share % cell — UAT-PH5-T3-61: literal 0% when share is null.
                UAT-PH5-T3-62: hidden on mobile (sm:block) since the
                amount cell already conveys the relative weight at a
                glance for the smaller viewport. */}
            <div className="hidden text-right text-num-sm text-[var(--muted-foreground)] sm:block sm:w-[80px]">
              {sharePct === null ? (
                <span aria-label="Zero share">0%</span>
              ) : (
                <span>{sharePct.toFixed(0)}%</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
