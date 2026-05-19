"use client";
/**
 * wallet-row.tsx — Single wallet row with two render variants.
 *
 * mode="persisted" — draggable row with 3 InlineEditCells + hover trash.
 *   Emits data-wallet-id={wallet.id} per W-5 contract.
 *   data-testid="wallet-row"
 *
 * mode="draft" — staged-add row (D-PH5-W9, W-4 acceptance).
 *   Empty Name input, autoFocus, no drag, no trash.
 *   Emits data-wallet-id="" per W-5 contract (empty until POST resolves).
 *   data-testid="wallet-row-draft"
 *
 * T-05-10: All text via JSX — React auto-escapes (no raw innerHTML).
 * D-PH5-R3: Currency cell is read-only plain text on Reserve-section rows.
 * D-PH5-W5: Hover reveals trash on desktop (group-hover:flex).
 * D-PH5-W6: Mobile first-tap sets data-selected → trash appears.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { Input } from "@/components/ui/input";
import { WalletDeleteConfirm } from "./wallet-delete-confirm";
import { WalletCustomizer, iconByName } from "./wallet-customizer";
import { centsToBare } from "@/lib/cents-format";
import type { WalletDto } from "@/hooks/use-wallets";

type WalletType = WalletDto["walletType"];

// UAT-PH5-T3-30: floor for the dynamic amount column. Covers "0.00"-ish
// values when the whole section is empty so the column never collapses.
const MIN_AMOUNT_CHARS = 4;

interface PersistedProps {
  mode: "persisted";
  wallet: WalletDto;
  budgetCurrency: string;
  // UAT-PH5-T3-14: sum of currentBalanceCents across all wallets in the same
  // section, supplied by WalletSection. Used to compute the Share column.
  sectionTotalCents: number;
  // UAT-PH5-T3-30: longest formatted-amount char length across the section.
  // Drives the dynamic min-width of the amount column so short balances
  // ("0", "456") don't leave a wide gap between currency and amount.
  // Optional — falls back to MIN_AMOUNT_CHARS when omitted (unit tests).
  maxAmountChars?: number;
  onUpdate: (patch: {
    name?: string;
    amount?: string;
    currency?: string;
    color?: string | null;
    icon?: string | null;
  }) => Promise<void>;
  onArchive: () => void;
  isReserveSection: boolean;
}

interface DraftProps {
  mode: "draft";
  sectionType: WalletType;
  budgetCurrency: string;
  maxAmountChars?: number;
  onCommit: (name: string) => Promise<void>; // fires POST on non-empty blur
  onDiscard: () => void; // fires on empty blur OR Escape
  pending: boolean; // POST in-flight
  error: string | null; // last POST error code
}

export function WalletRow(props: PersistedProps | DraftProps) {
  // ── DRAFT mode (W-4 staged-add) ──────────────────────────────────────────
  if (props.mode === "draft") {
    return <DraftRow {...props} />;
  }

  // ── PERSISTED mode ────────────────────────────────────────────────────────
  return <PersistedRow {...props} />;
}

// ────────────────────────────────────────────────────────────────────────────
// Draft variant — extracted to allow hooks in both branches
// ────────────────────────────────────────────────────────────────────────────

function DraftRow({
  budgetCurrency,
  maxAmountChars,
  onCommit,
  onDiscard,
  pending,
  error,
}: DraftProps) {
  const t = useTranslations("bdp.tab.wallets.row");
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount AND re-focus on error (user can retry)
  useEffect(() => {
    inputRef.current?.focus();
  }, [error]);

  const handleBlur = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      onDiscard();
      return;
    }
    await onCommit(trimmed);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onDiscard();
      return;
    }
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
  };

  return (
    <div
      data-testid="wallet-row-draft"
      data-wallet-id=""
      className={[
        "flex min-h-[56px] items-center gap-2 rounded-[var(--radius-md)]",
        "bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px]",
        error ? "ring-1 ring-[var(--destructive)]" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Drag-handle placeholder — draft rows cannot be dragged */}
      <div className="w-4" aria-hidden="true" />

      {/* Name input — auto-focused */}
      <div className="flex-1">
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKey}
          disabled={pending}
          placeholder={t("namePlaceholder")}
          className="h-9"
          aria-label={t("nameAria")}
          data-testid="wallet-draft-name-input"
        />
      </div>

      {/* Currency — read-only in draft state */}
      <div className="w-[44px] sm:w-[96px]">
        <span
          className="text-[var(--muted-foreground)]"
          aria-label={t("currencyReadOnlyAria", { ccy: budgetCurrency })}
        >
          {budgetCurrency}
        </span>
      </div>

      {/* Amount — always 0.00 in draft state.
          UAT-PH5-T3-30: width tracks the section's longest amount. */}
      <div
        className="text-right tabular-nums"
        style={{ minWidth: `${(maxAmountChars ?? MIN_AMOUNT_CHARS) + 1}ch` }}
      >
        <span className="text-num-md text-[var(--muted-foreground)]">0.00</span>
      </div>

      {/* UAT-PH5-T3-14: Share placeholder for column alignment with persisted rows.
          UAT-PH5-T3-24: hidden on mobile to mirror the persisted-row layout. */}
      <div
        className="hidden w-[64px] text-right text-num-sm text-[var(--muted-foreground)] sm:block sm:w-[80px]"
        aria-hidden="true"
      >
        —
      </div>

      {/* Trash placeholder — no trash on draft rows */}
      <div className="w-7" aria-hidden="true" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Persisted variant
// ────────────────────────────────────────────────────────────────────────────

function PersistedRow({
  wallet,
  budgetCurrency,
  sectionTotalCents,
  maxAmountChars,
  onUpdate,
  onArchive,
  isReserveSection,
}: PersistedProps) {
  const t = useTranslations("bdp.tab.wallets.row");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // UAT-PH5-T3-40: native pointer listeners (not React onPointer*) so
  // we can register with passive:false and call preventDefault during
  // an active horizontal swipe. React 19's synthetic pointer events
  // are unreliable for gesture capture on iOS Safari — handlers don't
  // always fire for synthetic-but-trusted touches, and we cannot
  // suppress the synthesised click after a swipe-release without
  // preventDefault on the move sequence. Going native gives us both.
  const ACTION_W = 88;
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  // Reset offset only on the open → closed transition (cancel/X). Earlier
  // version depended on `offset`, which triggered an infinite reset
  // during an active swipe because every setOffset re-ran the effect
  // with `!confirmOpen && offset !== 0` still true.
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
      // Claim the touch so the browser doesn't try to scroll the page.
      if (e.cancelable) e.preventDefault();
      setOffset(Math.max(-ACTION_W, Math.min(0, state.base + dx)));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (state.pid !== e.pointerId) return;
      if (state.locked) {
        const finalOffset =
          offsetRef.current <= -ACTION_W / 2 ? -ACTION_W : 0;
        setOffset(finalOffset);
        setSwiping(false);
        // Suppress the synthetic click iOS fires immediately after a
        // touch ends — without this, the click would land on whatever
        // cell happened to be under the finger at release and open its
        // editor.
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

  // UAT-PH5-T3-17: switch from useDraggable + useDroppable to useSortable so
  // siblings animate out of the way while a row is dragged (matches the
  // spendings-grid category column feel). The sortable id is the bare wallet
  // id; cross-section drops still resolve to the section's useDroppable
  // background id ("section-<TYPE>"). See wallet-section.tsx for the
  // SortableContext that scopes per-section reorder.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver: isRowDropOver,
  } = useSortable({ id: wallet.id });

  // Combine the dnd-kit sortable transform with the swipe offset so a
  // dragged-and-dropped row also keeps its mobile swipe state coherent.
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
      data-wallet-row-wrapper={wallet.id}
      // Pointer listeners attached natively in useEffect with
      // passive:false so preventDefault works during an active swipe.
    >
      {/* UAT-PH5-T3-38: mobile-only Delete revealed by horizontal swipe.
          Positioned absolutely behind the row's right edge; the row's
          opaque background covers it at rest. Slides into view as the
          row translates left. Tap = open confirm dialog. Desktop hides
          this entirely (`sm:hidden`) and uses the in-row hover trash. */}
      <button
        data-testid={`wallet-swipe-delete-${wallet.id}`}
        data-no-swipe
        aria-label={t("trashAria", { name: wallet.name })}
        aria-hidden={offset === 0}
        tabIndex={offset === 0 ? -1 : 0}
        onClick={() => setConfirmOpen(true)}
        style={{
          // UAT-PH5-T3-42: fade in with the swipe — at rest the button
          // sits BEHIND the row but the row's rounded right corner used
          // to expose a red sliver in the curve. Opacity gates on
          // offset so the button is fully invisible at rest and reaches
          // full opacity by the time the row has slid the full
          // ACTION_W. pointer-events follow visibility so the hidden
          // button can't catch stray taps either.
          opacity: Math.min(1, Math.abs(offset) / ACTION_W),
          pointerEvents: offset === 0 ? "none" : "auto",
          transition: swiping ? "none" : "opacity 200ms ease-out",
        }}
        className={[
          "absolute right-0 top-0 bottom-0 flex w-20 items-center justify-center",
          "rounded-[var(--radius-md)] bg-[var(--destructive)]",
          "text-body-md font-medium text-white",
          "cursor-pointer sm:hidden",
        ].join(" ")}
      >
        {t("swipeDeleteCta")}
      </button>
    <div
      ref={setNodeRef}
      data-testid="wallet-row"
      data-wallet-id={wallet.id}
      data-row-drop-over={isRowDropOver || undefined}
      // UAT-PH5-T3-23 + T3-38: dnd-kit sortable transform + horizontal
      // swipe offset compose here. transition stays a className so
      // sibling reorder + swipe settle both animate smoothly.
      style={{
        transform: combinedTransform,
        // During an active horizontal swipe the row tracks the finger
        // 1:1, so disable the snap transition; on release we restore
        // it so the snap animates.
        transition: swiping ? "none" : undefined,
        // Source row hidden completely during drag — the <DragOverlay>
        // ghost stands in.
        visibility: isDragging ? "hidden" : undefined,
      }}
      className="group relative flex min-h-[56px] w-full items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 transition-transform duration-200 ease-out hover:bg-[var(--surface-elevated-dark)] sm:min-h-[48px]"
    >
      <RowDragHandle
        name={wallet.name || "wallet"}
        listeners={listeners}
        attributes={attributes}
        ariaLabel={t("dragHandleAria", { name: wallet.name })}
      />

      {/* UAT-PH5-T3-1x: per-wallet color + icon trigger. Renders a placeholder
          dashed circle when both are null; otherwise the chosen icon in the
          chosen color. Opens a popover to pick / clear. */}
      <WalletCustomizer
        color={wallet.color ?? null}
        icon={wallet.icon ?? null}
        onChange={(patch) => onUpdate(patch).catch(() => {})}
        ariaLabel={`Customize ${wallet.name} appearance`}
      />

      {/* Name — editable. UAT-PH5-T3-26: `min-w-0` allows the flex item to
          shrink below its content width so the right-side columns (currency,
          amount) stay anchored at consistent X positions regardless of how
          long the wallet name is. */}
      <div className="min-w-0 flex-1" data-inline-cell>
        <InlineEditCell
          value={wallet.name}
          ariaLabel={t("nameAria")}
          testId={`wallet-name-${wallet.id}`}
          render={(v) => (
            <span className="block truncate">
              {v || (
                <span className="text-[var(--muted-foreground)]">
                  {t("namePlaceholder")}
                </span>
              )}
            </span>
          )}
          renderEditor={(draft, onChange) => (
            <Input
              autoFocus
              value={draft}
              onChange={(e) => onChange(e.target.value)}
              className="h-9"
              placeholder={t("namePlaceholder")}
            />
          )}
          onSave={(v) => onUpdate({ name: v })}
        />
      </div>

      {/* Currency — read-only for Reserve section per D-PH5-R3; editable otherwise.
          UAT-PH5-T3-24: narrower on mobile so name + amount have room.
          UAT-PH5-T3-42: render the CurrencyPicker directly (no
          InlineEditCell wrapper). On touch devices the picker emits a
          native <select> which opens the system wheel on the very
          first tap; the previous two-tap flow (tap cell → tap select)
          was fragile on iOS Safari. Desktop still works because Radix
          Select is its own click-to-open trigger. Mutation runs from
          onSelect directly. */}
      <div className="w-[36px] sm:w-[96px]" data-inline-cell>
        {isReserveSection ? (
          <span
            className="text-num-md"
            aria-label={t("currencyReadOnlyAria", { ccy: wallet.currency })}
          >
            {wallet.currency}
          </span>
        ) : (
          <CurrencyPicker
            value={wallet.currency}
            aria-label={t("currencyAria")}
            onSelect={(v: string) => onUpdate({ currency: v })}
          />
        )}
      </div>

      {/* Amount — numeric, editable.
           Uses defaultValue (uncontrolled) so the user can type freely
           without the controlled reformatter clobbering each keystroke.
           draft holds the raw decimal string the user typed.
           onSave sends it directly as the decimal amount string.
           UAT-PH5-T3-30: dynamic min-width based on the section's longest
           formatted amount + 1ch of slack. Short balances like "0" or
           "456" no longer leave a wide visual gap between the currency
           code and the right-aligned number. `tabular-nums` keeps digit
           widths uniform so rows in the same section align column-perfect. */}
      <div
        className="text-right tabular-nums"
        style={{ minWidth: `${(maxAmountChars ?? MIN_AMOUNT_CHARS) + 1}ch` }}
        data-inline-cell
      >
        <InlineEditCell
          // UAT-PH5-T3-25: editor seed mirrors the display formatting —
          // centsToBare drops a `.00` fraction so "10" enters the input
          // as "10" not "10.00". Non-zero fractions still pad to 2 digits.
          // UAT-PH5-T3-27: strip all non-decimal-input characters (group
          // separators, narrow no-break spaces, NBSP) so the value is a
          // clean editable decimal regardless of the user's locale.
          value={centsToBare(wallet.currentBalanceCents).replace(
            /[^0-9.-]/g,
            "",
          )}
          ariaLabel={t("amountAria")}
          testId={`wallet-amount-${wallet.id}`}
          render={() => (
            // UAT-PH5-T3-20: format the resting amount with the same rules
            // as the spendings grid — drop the `.00` fraction, pad non-zero
            // fractions to two digits, locale-aware grouping. `value` above
            // is reserved for the editor; display uses centsToBare directly
            // so "0" renders as "0" not "0.00", "1050" as "10.50".
            <span className="text-num-md">
              {centsToBare(wallet.currentBalanceCents)}
            </span>
          )}
          renderEditor={(draft, onChange) => (
            <Input
              autoFocus
              type="text"
              inputMode="decimal"
              defaultValue={draft}
              // UAT-PH5-T3-29: accept comma as the decimal separator
              // (PL/UK locales) and translate to the dot the server +
              // domain layer expect. The input still displays whatever
              // the user typed because `defaultValue` is uncontrolled.
              onChange={(e) => onChange(e.target.value.replace(",", "."))}
              className="h-9 text-right"
            />
          )}
          onSave={(v) => onUpdate({ amount: v.replace(",", ".") })}
        />
      </div>

      {/* UAT-PH5-T3-14: Share — wallet's slice of its section's total.
          Em-dash when the section sum is zero (no meaningful ratio).
          UAT-PH5-T3-24: hidden on mobile so the row's name + amount fit
          the 390 px viewport without truncation. The metric is
          desktop-only signal. */}
      <div
        data-testid={`wallet-share-${wallet.id}`}
        className="hidden w-[64px] text-right text-num-sm text-[var(--muted-foreground)] sm:block sm:w-[80px]"
        aria-label={t("shareAria", { name: wallet.name })}
      >
        {sectionTotalCents > 0
          ? `${((Number(wallet.currentBalanceCents) / sectionTotalCents) * 100).toFixed(0)}%`
          : "—"}
      </div>

      {/* Trash — desktop only. Hover-revealed; mobile uses swipe instead. */}
      <button
        data-testid={`wallet-trash-${wallet.id}`}
        aria-label={t("trashAria", { name: wallet.name })}
        onClick={(e) => {
          e.stopPropagation();
          setConfirmOpen(true);
        }}
        className={[
          // UAT-PH5-T3-32: desktop-only (mobile reveal moved to swipe).
          "hidden h-7 w-7 items-center justify-center rounded sm:flex",
          "text-[var(--destructive)]",
          "invisible group-hover:visible",
          "cursor-pointer",
        ].join(" ")}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>

    <WalletDeleteConfirm
      name={wallet.name}
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      onConfirm={() => {
        onArchive();
        setConfirmOpen(false);
      }}
    />
    </div>
  );
}
