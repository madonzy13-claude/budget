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

  // UAT-PH5-T3-32: iOS-style swipe-left to reveal Delete on mobile. The
  // wrapper is a horizontally-scrollable flex container with two snap
  // points; the inner row is one snap target (resting state) and the
  // trailing Delete button is the other (revealed state). Pure CSS, no
  // JS gesture lib needed. Desktop disables the scroll/snap entirely and
  // uses the existing hover-revealed trash button instead.
  return (
    <div
      className={[
        "flex snap-x snap-mandatory overflow-x-auto",
        "[-ms-overflow-style:none] [scrollbar-width:none]",
        "[&::-webkit-scrollbar]:hidden",
        // Desktop: no swipe — wrapper collapses into the section flow.
        "sm:snap-none sm:overflow-x-visible",
      ].join(" ")}
      data-wallet-row-wrapper={wallet.id}
    >
    <div
      ref={setNodeRef}
      data-testid="wallet-row"
      data-wallet-id={wallet.id}
      data-row-drop-over={isRowDropOver || undefined}
      // UAT-PH5-T3-23: transition lives on the className so EVERY transform
      // change animates — including the very first sibling-shift of a drag.
      // dnd-kit's per-frame `transition` value was unreliable on the first
      // pointer move ("", undefined, then a real string) which read as a
      // direction-specific jump. Letting Tailwind own the transition rule
      // removes that timing dependency entirely.
      style={{
        transform: CSS.Transform.toString(transform),
        // Source row hidden completely during drag — the <DragOverlay>
        // ghost stands in. Previously kept at 0.3 to indicate snap-back
        // position; that ghost-row artefact has been removed per
        // user feedback.
        visibility: isDragging ? "hidden" : undefined,
      }}
      className="group flex min-h-[56px] w-full shrink-0 snap-start items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 transition-transform duration-200 ease-out hover:bg-[var(--surface-elevated-dark)] sm:min-h-[48px] sm:w-auto sm:flex-1"
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
          UAT-PH5-T3-24: narrower on mobile so name + amount have room. */}
      <div className="w-[36px] sm:w-[96px]" data-inline-cell>
        {isReserveSection ? (
          <span
            className="text-num-md"
            aria-label={t("currencyReadOnlyAria", { ccy: wallet.currency })}
          >
            {wallet.currency}
          </span>
        ) : (
          <InlineEditCell
            value={wallet.currency}
            ariaLabel={t("currencyAria")}
            testId={`wallet-currency-${wallet.id}`}
            render={(v) => <span className="text-num-md">{v}</span>}
            renderEditor={(draft, onChange) => (
              <CurrencyPicker
                value={draft}
                onSelect={(v: string) => onChange(v)}
              />
            )}
            onSave={(v) => onUpdate({ currency: v })}
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
    {/* UAT-PH5-T3-32: mobile-only swipe-revealed Delete. Sits as a second
        snap target after the row; user swipes left, the row scrolls out
        and the button is exposed. Tap → open confirm dialog. Desktop
        hides this entirely; the hover trash above takes over. */}
    <button
      data-testid={`wallet-swipe-delete-${wallet.id}`}
      aria-label={t("trashAria", { name: wallet.name })}
      onClick={() => setConfirmOpen(true)}
      className={[
        "ml-2 flex w-20 shrink-0 snap-end items-center justify-center",
        "rounded-[var(--radius-md)] bg-[var(--destructive)]",
        "text-body-md font-medium text-white",
        "cursor-pointer sm:hidden",
      ].join(" ")}
    >
      {t("swipeDeleteCta")}
    </button>

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
