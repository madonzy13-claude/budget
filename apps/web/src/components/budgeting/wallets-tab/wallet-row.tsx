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
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { useIsWide } from "@/hooks/use-is-wide";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { Input } from "@/components/ui/input";
import { WalletDeleteConfirm } from "./wallet-delete-confirm";
import { WalletCustomizer } from "./wallet-customizer";
import { centsToBare } from "@/lib/cents-format";
import type { WalletDto } from "@/hooks/use-wallets";

type WalletType = WalletDto["walletType"];

// UAT-PH5-T3-30: floor for the dynamic amount column. Covers "0.00"-ish
// values when the whole section is empty so the column never collapses.
const MIN_AMOUNT_CHARS = 4;

/** Keep only a signed decimal: digits, ONE leading "-", ONE ".". Comma→dot. */
export function sanitizeAmount(raw: string): string {
  let v = raw.replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  v = (v.startsWith("-") ? "-" : "") + v.replace(/-/g, ""); // minus only leading
  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, ""); // one dot
  return v;
}

interface PersistedProps {
  mode: "persisted";
  wallet: WalletDto;
  budgetCurrency: string;
  // UAT-PH5-T3-46: section total in the budget's default currency.
  // Numerator (`wallet.currentBalanceInBudgetCurrencyCents`) shares
  // the same scale, so the share % is comparable across mixed-
  // currency sections. Optional — tests that don't exercise Share
  // may omit it (then row renders em-dash for share).
  sectionTotalBudgetCents?: number;
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
  // Fires when the draft mini-form is left (non-empty name) → POST /wallets with
  // the chosen currency; the amount is applied via a balance PATCH after create.
  onCommit: (name: string, currency: string, amount: string) => Promise<void>;
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
  const [currency, setCurrency] = useState(budgetCurrency);
  const [amount, setAmount] = useState("0");
  const inputRef = useRef<HTMLInputElement>(null);
  const wide = useIsWide();

  // Auto-focus on mount AND re-focus on error (user can retry)
  useEffect(() => {
    inputRef.current?.focus();
  }, [error]);

  // 260723-2/4: the draft is a mini-form (name + currency + amount) with REAL
  // controls on EVERY device — tap/click a field to edit it in place, or hop
  // between them with Tab / Shift+Tab. It commits only when focus leaves the
  // WHOLE row, so field-to-field navigation never saves early. The roving
  // keyboard-nav never fires while a draft field is focused (it defers to text
  // entry), so Tab/arrows here don't drive the tab-pill navigation.
  const commitIfLeaving = (e: React.FocusEvent<HTMLDivElement>) => {
    const rt = e.relatedTarget as HTMLElement | null;
    if (rt && e.currentTarget.contains(rt)) return; // hopping fields within the row
    if (rt?.closest?.('[role="listbox"],[role="dialog"]')) return; // a dropdown is open
    const trimmed = name.trim();
    if (!trimmed) {
      onDiscard();
      return;
    }
    onCommit(trimmed, currency, amount);
  };

  // Tab / Shift+Tab CYCLE within the three draft fields, wrapping: name →
  // currency → amount → name (and reverse). Handled in the CAPTURE phase so it
  // runs before Radix's Select trigger or the browser's native Tab — nothing can
  // intercept it first. Adding a wallet stays a self-contained loop; the user
  // commits with Enter or by clicking away.
  const handleRowKeyCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const row = e.currentTarget;
    const fields = [
      row.querySelector<HTMLElement>('[data-testid="wallet-draft-name-input"]'),
      row.querySelector<HTMLElement>(
        '[data-nav-field="currency"] button, [data-nav-field="currency"] [role="combobox"], [data-nav-field="currency"] select',
      ),
      row.querySelector<HTMLElement>(
        '[data-testid="wallet-draft-amount-input"]',
      ),
    ].filter((f): f is HTMLElement => !!f);
    const active = document.activeElement;
    const idx = active
      ? fields.findIndex((f) => f === active || f.contains(active))
      : -1;
    // Only trap Tab while focus is ON a draft field (not, e.g., inside an OPEN
    // currency dropdown, whose listbox is portaled outside the row).
    if (idx === -1 || fields.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.shiftKey ? -1 : 1;
    const next = fields[(idx + dir + fields.length) % fields.length]!;
    next.focus();
    // 260723: landing on the currency picker OPENS its dropdown so the user can
    // pick straight away — Radix highlights the current selection when it opens.
    // (Native <select> on touch has no such trigger; only the desktop Radix
    // button/combobox is clicked.)
    if (next.matches('button, [role="combobox"]')) next.click();
  };

  const handleRowKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onDiscard();
      return;
    }
    // Enter in a text field commits (leaves the row). On the currency picker,
    // Enter belongs to the picker — don't hijack it.
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      (e.target as HTMLElement).blur();
    }
  };

  return (
    <div
      data-testid="wallet-row-draft"
      data-wallet-id=""
      onBlur={commitIfLeaving}
      onKeyDownCapture={handleRowKeyCapture}
      onKeyDown={handleRowKey}
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

      {/* Name — the widest field (flex-1), auto-focused. */}
      <div className="min-w-0 flex-1">
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          placeholder={t("namePlaceholder")}
          className="h-9"
          aria-label={t("nameAria")}
          data-testid="wallet-draft-name-input"
        />
      </div>

      {/* Currency — 260723-4: a real picker on EVERY device. Rich dropdown on
          desktop, native <select> on touch (opens on the first tap). */}
      <div
        className="w-[44px] shrink-0 rounded sm:w-[96px] md:w-[224px]"
        data-nav-field="currency"
      >
        <CurrencyPicker
          value={currency}
          aria-label={t("currencyAria")}
          onSelect={setCurrency}
          richLabel={wide}
          desktopDropdown={wide}
        />
      </div>

      {/* Amount — 260723-2: a real editable field on mobile (tap → keyboard);
          a bare "0" placeholder on desktop (guided flow edits the persisted row).
          UAT-PH5-T3-30: width tracks the section's longest amount. */}
      {/* Amount — 260723-3: a COMPACT right-aligned field. `w-0` gives it a
          0 flex-basis so the input can't blow the cell up, while `minWidth`
          (SAME formula as the persisted row) makes the column line up with the
          existing wallets. */}
      <div
        className="w-0 shrink-0 text-right tabular-nums"
        style={{ minWidth: `${(maxAmountChars ?? MIN_AMOUNT_CHARS) + 1}ch` }}
        data-nav-field="amount"
      >
        <Input
          type="text"
          inputMode="decimal"
          value={amount}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
          disabled={pending}
          aria-label={t("amountAria")}
          data-testid="wallet-draft-amount-input"
          // 260723: a bit of right padding so the digits aren't jammed against
          // the input's border (the draft amount is a bordered box; the
          // persisted rows are plain text, so a small offset there is fine).
          className="h-9 w-full px-2 text-right"
        />
      </div>

      {/* UAT-PH5-T3-14: Share placeholder for column alignment with persisted rows.
          UAT-PH5-T3-24: hidden on mobile to mirror the persisted-row layout. */}
      <div
        className="hidden w-[64px] text-right text-num-sm text-[var(--muted-foreground)] sm:block sm:w-[80px]"
        aria-hidden="true"
      >
        —
      </div>

      {/* Trash placeholder — matches the persisted trash (hidden on mobile,
          shown on sm+) so the amount/currency columns line up on every width. */}
      <div className="hidden w-7 sm:block" aria-hidden="true" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Persisted variant
// ────────────────────────────────────────────────────────────────────────────

function PersistedRow({
  wallet,
  budgetCurrency: _budgetCurrency,
  sectionTotalBudgetCents,
  maxAmountChars,
  onUpdate,
  onArchive,
  isReserveSection,
}: PersistedProps) {
  const t = useTranslations("bdp.tab.wallets.row");
  const locale = useLocale();
  // Desktop (≥md) has room for the full currency NAME in the picker (trigger +
  // dropdown body), matching the investments edit banner. Below md the cell is
  // narrow → keep the compact code-only picker (and native wheel on touch).
  const wide = useIsWide();
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
        const finalOffset = offsetRef.current <= -ACTION_W / 2 ? -ACTION_W : 0;
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
  } = useSortable({
    id: wallet.id,
    // Animate the gap-open WHILE dragging, but NOT the post-drop layout change.
    // The reorder comes from React Query (DOM order changes on drop); with the
    // old constant `transition-transform` class @dnd-kit also animated the
    // transform-reset → the sibling above the drop rendered at (new slot +
    // leftover transform) then slid to 0 = the "jump up then settle". Returning
    // `isSorting` makes the drop an instant transform→DOM handoff (no jump),
    // while keeping the during-drag slide. (Mirrors the investments fix.)
    animateLayoutChanges: ({ isSorting }) => isSorting,
  });

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
          "text-white",
          "cursor-pointer sm:hidden",
        ].join(" ")}
      >
        <Trash2 className="h-5 w-5" aria-hidden="true" />
      </button>
      <div
        ref={setNodeRef}
        data-testid="wallet-row"
        data-wallet-id={wallet.id}
        data-row-drop-over={isRowDropOver || undefined}
        // UAT-PH5-T3-23 + T3-38: dnd-kit sortable transform + horizontal swipe
        // offset compose here. Use @dnd-kit's MANAGED `transition` (gated by
        // animateLayoutChanges above) instead of a constant `transition-transform`
        // class — the constant class animated the transform-reset on drop and
        // caused the sibling "jump up then settle". The managed transition
        // animates the during-drag slide but is instant on drop.
        style={{
          transform: combinedTransform,
          // During an active horizontal swipe the row tracks the finger 1:1, so
          // disable the transition; otherwise use the managed sortable transition.
          transition: swiping ? "none" : transition,
          // Source row hidden completely during drag — the <DragOverlay>
          // ghost stands in.
          visibility: isDragging ? "hidden" : undefined,
        }}
        data-nav-item
        data-nav-type="wallet"
        data-nav-key={`wallet-${wallet.id}`}
        className="group relative flex min-h-[56px] w-full items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 hover:bg-[var(--surface-elevated-dark)] data-[nav-highlighted=true]:bg-[var(--surface-elevated-dark)] sm:min-h-[48px]"
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
          ariaLabel={t("customizeAria", { name: wallet.name })}
        />

        {/* Name — editable. UAT-PH5-T3-26: `min-w-0` allows the flex item to
          shrink below its content width so the right-side columns (currency,
          amount) stay anchored at consistent X positions regardless of how
          long the wallet name is. */}
        <div
          className="min-w-0 flex-1 rounded data-[nav-field-active=true]:ring-1 data-[nav-field-active=true]:ring-[var(--primary)]"
          data-inline-cell
          data-nav-field="name"
        >
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
            onSave={(v) => {
              // Empty name is invalid — direct message + keep the old name (no
              // server round-trip → no generic "couldn't save" error).
              if (!v.trim()) {
                toast.error(t("nameRequired"));
                return Promise.resolve();
              }
              return onUpdate({ name: v.trim() });
            }}
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
        <div
          className="w-[44px] rounded data-[nav-field-active=true]:ring-1 data-[nav-field-active=true]:ring-[var(--primary)] sm:w-[96px] md:w-[224px]"
          data-inline-cell
          data-nav-field="currency"
        >
          {isReserveSection ? (
            // Match the investments-row currency: small + grey, right-aligned so it
            // sits tight to the amount instead of floating mid-column (r31 item 3).
            <span
              className="block w-full text-right text-num-sm text-[var(--muted-foreground)]"
              aria-label={t("currencyReadOnlyAria", { ccy: wallet.currency })}
            >
              {wallet.currency}
            </span>
          ) : (
            <CurrencyPicker
              value={wallet.currency}
              aria-label={t("currencyAria")}
              onSelect={(v: string) => onUpdate({ currency: v })}
              richLabel={wide}
              desktopDropdown={wide}
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
          className="rounded text-right tabular-nums data-[nav-field-active=true]:ring-1 data-[nav-field-active=true]:ring-[var(--primary)]"
          style={{ minWidth: `${(maxAmountChars ?? MIN_AMOUNT_CHARS) + 1}ch` }}
          data-inline-cell
          data-nav-field="amount"
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
                {centsToBare(wallet.currentBalanceCents, locale)}
              </span>
            )}
            renderEditor={(draft, onChange) => (
              <Input
                autoFocus
                type="text"
                inputMode="decimal"
                defaultValue={draft}
                // Keeps a signed decimal (digits, one leading "-", one ".") — a
                // negative balance (credit-card liability) is entered by pasting the
                // minus; iOS's numeric pad has no minus key (r-this).
                onChange={(e) => {
                  const v = sanitizeAmount(e.target.value);
                  if (v !== e.target.value) e.target.value = v;
                  onChange(v);
                }}
                className="h-9 text-right"
              />
            )}
            onSave={(v) => onUpdate({ amount: sanitizeAmount(v) })}
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
          {(() => {
            if (!sectionTotalBudgetCents || sectionTotalBudgetCents <= 0)
              return "—";
            const numer = Number(
              wallet.currentBalanceInBudgetCurrencyCents ??
                wallet.currentBalanceCents,
            );
            const pct = (numer / sectionTotalBudgetCents) * 100;
            return `${pct.toFixed(0)}%`;
          })()}
        </div>

        {/* Trash — desktop only. Hover-revealed; mobile uses swipe instead. */}
        <button
          data-testid={`wallet-trash-${wallet.id}`}
          data-nav-delete
          aria-label={t("trashAria", { name: wallet.name })}
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          className={[
            // UAT-PH5-T3-32: desktop-only (mobile reveal moved to swipe).
            "hidden h-7 w-7 items-center justify-center rounded sm:flex",
            "text-[var(--destructive)]",
            // Revealed on hover OR keyboard-nav highlight.
            "invisible group-hover:visible group-data-[nav-highlighted=true]:visible",
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
