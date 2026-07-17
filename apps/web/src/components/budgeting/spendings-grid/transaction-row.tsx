"use client";
/**
 * transaction-row.tsx — Confirmed transaction row.
 *
 * Reveal model: chips show on hover (hover-capable devices) or on tap (touch).
 * Inline edit: single click on the amount while the row is revealed. On touch
 * the first tap reveals, a second tap on the amount edits.
 *
 * Robust-minimal offline (260614-q1v): the offline write queue + per-row
 * pending/unsent marker were removed. Offline writes roll back with a toast
 * instead of leaving a hanging row, so there is no in-flight row state here.
 */
import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { useDeleteTransaction } from "@/hooks/use-delete-transaction";
import { useUpdateTransaction } from "@/hooks/use-update-transaction";
import { centsToBare, centsToDisplayCompact } from "@/lib/cents-format";
import { parseDecimal } from "@/lib/decimal";
import { formatInstantDate } from "@/lib/format-date";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface TransactionRowProps {
  txn: {
    id: string;
    amountConvertedCents: string;
    currencyConverted: string;
    transactionDate: string;
    amountOriginalCents?: string;
    currencyOriginal?: string;
    fxRate?: string;
    fxAsOf?: string;
    note?: string | null;
    /** ISO instant the transaction was created (for the hover tooltip). */
    createdAt?: string;
  };
  budgetId: string;
  month: string;
  onEdit: (txnId: string) => void;
  /** Round the row's bottom corners — used for the last confirmed row when
   *  drafts follow, so the confirmed group reads as a closed group above
   *  the draft section. */
  roundedBottom?: boolean;
  /** Archived (keep-history) column → row is locked: no click-to-edit, no
   *  double-tap edit, no action chips. */
  readOnly?: boolean;
}

export function TransactionRow({
  txn,
  budgetId,
  month,
  onEdit,
  roundedBottom,
  readOnly = false,
}: TransactionRowProps) {
  const t = useTranslations("grid.txn");
  const tc = useTranslations("grid.confirm.deleteTxn");
  const locale = useLocale();
  const userTz = useUserTimezone();
  const [revealed, setRevealed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const deleteMutation = useDeleteTransaction(budgetId, month);
  const updateMutation = useUpdateTransaction(budgetId, month);

  // r40b: keyboard-focused rows reveal their action chips too (icons must show
  // when a row is highlighted via arrow navigation, not only on hover/tap).
  const showChips = (hovered || revealed || focused) && !editing && !readOnly;

  // Inline-edit focus management for iOS Safari.
  //
  // Competing constraints:
  //   1. iOS auto-scrolls focused input → grid slides up behind page header.
  //      Fix: focus with preventScroll, restore container.scrollTop next frame.
  //   2. Keyboard covers lower half of viewport → input invisible.
  //      Fix: scroll the grid container so input.bottom sits above keyboard.
  //   3. Column sticky header band can eat the entire above-keyboard area
  //      (name + 5 summary rows + quick entry ≈ 280px). Scrolling up then
  //      pushes the input behind the sticky band.
  //      Fix: tag the grid container with `data-editing-amount` while
  //      editing; global.css drops `position: sticky` to `relative` on the
  //      column-sticky bands, freeing the whole viewport for the input.
  //      The sticky band scrolls off naturally with the column content.
  //   4. After unpinning, still cap scrollTop so input.top stays inside
  //      the grid container bounds (won't disappear past the wrapper top).
  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    function findScrollableAncestor(
      el: HTMLElement | null,
    ): HTMLElement | null {
      let cur = el?.parentElement ?? null;
      while (cur) {
        const s = getComputedStyle(cur);
        if (/(auto|scroll)/.test(s.overflowY)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    const container = findScrollableAncestor(input);
    const savedTop = container?.scrollTop ?? 0;

    // Unpin sticky column headers so the input has the full viewport.
    if (container) container.setAttribute("data-editing-amount", "true");

    function adjustForKeyboard() {
      if (!input || !container) return;
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const padding = 24;
      // Reserve extra scroll space below the column content equal to the
      // keyboard height. Without this, rows at the bottom of the longest
      // column can't scroll far enough to clear the keyboard — the grid
      // hits scrollHeight - clientHeight before the row is above the
      // keyboard. Padding extends scrollHeight, unlocking the needed range.
      const kbHeight = Math.max(0, window.innerHeight - visibleBottom);
      container.style.paddingBottom =
        kbHeight > 0 ? `${kbHeight + padding}px` : "";

      const inputRect = input.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const overflow = inputRect.bottom - (visibleBottom - padding);
      if (overflow > 0) {
        // Cap scroll so input.top can't disappear above grid container top.
        const headroom = Math.max(
          0,
          inputRect.top - containerRect.top - padding,
        );
        container.scrollTop += Math.min(overflow, headroom);
      }
    }

    input.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      if (container) container.scrollTop = savedTop;
      setTimeout(adjustForKeyboard, 350);
    });

    const vv = window.visualViewport;
    vv?.addEventListener("resize", adjustForKeyboard);
    return () => {
      vv?.removeEventListener("resize", adjustForKeyboard);
      if (container) {
        // Re-pin sticky bands BEFORE restoring scrollTop, otherwise the
        // edited row would land under the just-pinned header. savedTop
        // matches the pre-edit position, so the row stays exactly where
        // the user double-tapped.
        container.removeAttribute("data-editing-amount");
        container.style.paddingBottom = "";
        container.scrollTop = savedTop;
      }
    };
  }, [editing]);

  // Single-reveal coordination across rows. When any row reveals OR starts
  // editing, it broadcasts a `txn-row-revealed` event; every other row
  // clears its highlight on receive. Clearing `hovered` too is critical:
  // iOS Safari synthesizes onMouseEnter on tap but never onMouseLeave, so
  // `hovered` would otherwise latch true and keep the row highlighted.
  useEffect(() => {
    function onOtherRevealed(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id !== txn.id) {
        setRevealed(false);
        setHovered(false);
      }
    }
    window.addEventListener("txn-row-revealed", onOtherRevealed);
    return () =>
      window.removeEventListener("txn-row-revealed", onOtherRevealed);
  }, [txn.id]);

  // Touch reveal collapses on outside tap / Escape.
  useEffect(() => {
    if (!revealed) return;
    function onPointerDown(e: PointerEvent) {
      if (!rowRef.current || !rowRef.current.contains(e.target as Node)) {
        setRevealed(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRevealed(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [revealed]);

  const formattedAmount = centsToBare(txn.amountConvertedCents, locale);
  // r40b (item 8): the focus meta line shows the CREATION date in the user's
  // timezone, date-only + short month ("13 Feb 2026") — NOT the edit time and
  // NOT the spending calendar date. Falls back to the spending date if the row
  // predates the created_at wiring.
  const formattedDate = txn.createdAt
    ? formatInstantDate(txn.createdAt, locale, userTz, { month: "short" })
    : new Date(`${txn.transactionDate}T00:00:00`).toLocaleDateString(locale);
  const confirmAmount = centsToDisplayCompact(
    txn.amountConvertedCents,
    txn.currencyConverted,
    locale,
  );
  const confirmDate = new Date(
    `${txn.transactionDate}T00:00:00`,
  ).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function startEditing() {
    setEditValue((parseInt(txn.amountConvertedCents, 10) / 100).toString());
    setEditing(true);
    setRevealed(false);
    setHovered(false);
    // Clear highlight on every other row across all columns.
    window.dispatchEvent(
      new CustomEvent("txn-row-revealed", { detail: { id: txn.id } }),
    );
  }

  function handleClick(e: React.MouseEvent) {
    if (editing) return;
    const hoverCapable =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover)").matches;
    const onAmount = !!(e.target as HTMLElement).closest("[data-amount-cell]");
    // Hover-capable devices: a click on the amount enters inline edit (you
    // must already be hovering, so the row is "revealed").
    if (onAmount && hoverCapable) {
      startEditing();
      return;
    }
    // Touch devices have no hover — single tap toggles the reveal state.
    // Edit is reached via a double-tap on the amount (see handleAmountDoubleClick).
    if (!hoverCapable) {
      setRevealed((r) => {
        const next = !r;
        if (next) {
          // Tell other rows to collapse — only one row revealed at a time.
          window.dispatchEvent(
            new CustomEvent("txn-row-revealed", { detail: { id: txn.id } }),
          );
        }
        return next;
      });
    }
  }

  function handleAmountDoubleClick(e: React.MouseEvent) {
    // Double-tap on the amount enters inline edit on touch devices.
    // Harmless on hover-capable devices — the first click already entered edit,
    // so by the time dblclick would fire the amount span is no longer mounted.
    e.preventDefault();
    e.stopPropagation();
    if (editing) return;
    startEditing();
  }

  // Manual double-tap detection for iOS Safari. The native pipeline can still
  // trigger viewport double-tap-zoom on rapid taps over a text span even when
  // `touch-action: manipulation` is set; React's onTouchStart handlers are
  // also passive in some versions, which means preventDefault becomes a
  // no-op. We attach a non-passive native listener directly so the second tap
  // within 400ms is reliably cancelled and inline edit fires explicitly.
  const lastTapRef = useRef(0);
  const cellRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = cellRef.current;
    if (!el || readOnly) return; // archived column → no double-tap edit
    const startEditingNow = () => {
      setEditValue((parseInt(txn.amountConvertedCents, 10) / 100).toString());
      setEditing(true);
      setRevealed(false);
      setHovered(false);
      window.dispatchEvent(
        new CustomEvent("txn-row-revealed", { detail: { id: txn.id } }),
      );
    };
    const handler = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTapRef.current < 400) {
        e.preventDefault();
        e.stopPropagation();
        lastTapRef.current = 0;
        startEditingNow();
        return;
      }
      lastTapRef.current = now;
    };
    el.addEventListener("touchstart", handler, { passive: false });
    return () => el.removeEventListener("touchstart", handler);
  }, [txn.amountConvertedCents, readOnly]);

  function commitEdit() {
    const trimmed = editValue.trim();
    const cents = parseDecimal(trimmed);
    const original = parseInt(txn.amountConvertedCents, 10);
    // Clearing the field or zeroing the amount deletes the row.
    if (trimmed === "" || cents === 0) {
      focusAfterDelete();
      deleteMutation.mutate(txn.id);
      setEditing(false);
      return;
    }
    // Otherwise only persist when the amount actually changed.
    if (cents !== null && cents !== original) {
      updateMutation.mutate({ txId: txn.id, amountCents: cents });
    }
    setEditing(false);
    setHovered(false);
    setRevealed(false);
    refocusRow();
  }

  // r40: after a quick edit ends (commit or Escape) focus returns to the ROW
  // so arrow-key navigation continues without re-entering the list. rAF: the
  // editor must unmount first or its blur handler re-commits.
  function refocusRow() {
    requestAnimationFrame(() => rowRef.current?.focus());
  }

  // r40b (item 1): after a delete, move focus to the item that slides into the
  // deleted row's slot (or the last row if it WAS the last); if the column is
  // now empty, focus its quick-add input. Captures the column + index NOW, then
  // waits (rAF poll) for React to unmount the row before focusing.
  function focusAfterDelete() {
    const row = rowRef.current;
    const column = row?.closest<HTMLElement>(
      '[data-testid^="category-column-"]',
    );
    if (!row || !column) return;
    const rowsNow = Array.from(
      column.querySelectorAll<HTMLElement>("[data-txn-nav]"),
    );
    const idx = rowsNow.indexOf(row);
    const focusNext = (attempt: number) => {
      const rows = Array.from(
        column.querySelectorAll<HTMLElement>("[data-txn-nav]"),
      );
      if (rows.includes(row) && attempt < 10) {
        requestAnimationFrame(() => focusNext(attempt + 1));
        return;
      }
      if (rows.length > 0) {
        rows[Math.min(idx, rows.length - 1)]?.focus();
      } else {
        column
          .querySelector<HTMLElement>('input[data-testid^="quick-entry-"]')
          ?.focus();
      }
    };
    requestAnimationFrame(() => focusNext(0));
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setHovered(false);
      setRevealed(false);
      refocusRow();
    }
  }

  return (
    <div
      ref={rowRef}
      data-testid={`txn-row-${txn.amountConvertedCents}`}
      // r40 keyboard nav: rows are reached with ArrowUp/Down (grid-key-nav),
      // NOT Tab — the tab order belongs to the quick-add inputs. data-txn-nav
      // marks arrow-navigable rows; archived (readOnly) rows opt out.
      {...(readOnly ? {} : { "data-txn-nav": "" })}
      onClick={readOnly ? undefined : handleClick}
      onMouseEnter={() => {
        setHovered(true);
        // r40b: focus-follows-mouse. Hovering a row makes it the current nav
        // anchor so the previously arrow-focused row's highlight clears and the
        // next arrow press is relative to THIS row. Skip while this row is
        // editing, on read-only rows, and when the user is typing in a field
        // (don't steal focus from a quick input / amount editor mid-entry).
        if (readOnly || editing) return;
        const ae = document.activeElement as HTMLElement | null;
        const typingElsewhere =
          !!ae &&
          ae !== rowRef.current &&
          (ae.tagName === "INPUT" ||
            ae.tagName === "TEXTAREA" ||
            ae.isContentEditable);
        if (typingElsewhere) return;
        rowRef.current?.focus({ preventScroll: true });
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(e) => {
        if (readOnly || editing) return;
        if (e.target !== e.currentTarget) return; // row itself, not the editor
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          // r40b: Cmd/Ctrl+Enter opens the FULL editor (same as the pen chip),
          // distinct from a plain Enter which starts the inline amount edit.
          e.preventDefault();
          onEdit(txn.id);
        } else if (e.key === "Enter") {
          e.preventDefault();
          startEditing();
        } else if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          setDeleteOpen(true);
        }
      }}
      role="row"
      tabIndex={-1}
      className={cn(
        "flex min-h-[40px] items-center gap-2 px-3 py-1",
        // Keyboard focus reads exactly like hover — elevated surface, no
        // accent ring (r40 UAT).
        "outline-none focus-visible:bg-[var(--surface-elevated-dark)]",
        readOnly ? "cursor-default select-none" : "cursor-pointer select-none",
        roundedBottom && "rounded-b-md",
        showChips && "bg-[var(--surface-elevated-dark)]",
      )}
    >
      {/* Amount cell. */}
      <div
        ref={cellRef}
        data-amount-cell
        onDoubleClick={readOnly ? undefined : handleAmountDoubleClick}
        style={{
          touchAction: "manipulation",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center",
          // UAT round 22: amount cell always reads as pointer. Earlier
          // round 21 flipped to `cursor-text` once chips were revealed,
          // but the cell is still a click target at that point (the
          // double-click on the AMOUNT span enters edit; the wrapper
          // cell behaves like a button). Only the inner input during
          // edit mode shows the I-beam — and that's the native
          // <input> getting `cursor: text` from the global rule.
          "cursor-pointer",
        )}
      >
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={commitEdit}
            className="min-w-0 flex-1 rounded border border-[var(--primary)] bg-transparent px-2 py-0.5 text-base sm:text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex min-w-0 flex-1 flex-col justify-center">
            <span className="flex items-baseline gap-2 text-sm text-[var(--body-on-dark)]">
              <span className="shrink-0">{formattedAmount}</span>
              {/* Inline note only while the row is RESTING — keeps it compact.
                  An ACTIVE row shows the fuller meta line (date · note) below. */}
              {txn.note && !showChips ? (
                <span
                  data-testid="txn-row-note"
                  className="min-w-0 truncate text-xs text-[var(--muted-foreground)]"
                >
                  {txn.note}
                </span>
              ) : null}
            </span>
            {/* r40b: on focus / hover / tap-reveal (active) render the CREATION
                date inline in a small muted line — replaces the removed hover
                tooltip, and works for keyboard focus too. Date only (no note). */}
            {showChips && (
              <span
                data-testid="txn-row-meta"
                className="min-w-0 truncate text-[10px] leading-tight text-[var(--muted-foreground)]"
              >
                {formattedDate}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Action chips — shown on hover (desktop) or tap-reveal (touch) */}
      {showChips && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="txn-action-edit"
            aria-label={t("action.delete")}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(txn.id);
              setRevealed(false);
            }}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded hover:bg-[var(--surface-card-dark)]"
          >
            <Pencil
              className="h-4 w-4 text-[var(--body-on-dark)]"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            data-testid="txn-action-delete"
            aria-label={t("action.delete")}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteOpen(true);
              setRevealed(false);
            }}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded hover:bg-[var(--surface-card-dark)]"
          >
            <Trash2
              className="h-4 w-4 text-[var(--destructive)]"
              aria-hidden="true"
            />
          </button>
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent
          // Focus the destructive action so a single Enter key confirms.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const btn = document.querySelector<HTMLButtonElement>(
              '[data-testid="txn-row-delete-confirm"]',
            );
            btn?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tc("body", { amount: confirmAmount, date: confirmDate })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="txn-row-delete-confirm"
              onClick={() => {
                focusAfterDelete();
                deleteMutation.mutate(txn.id);
                setDeleteOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc("cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
