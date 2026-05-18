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
import { useDraggable } from "@dnd-kit/core";
import { Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { Input } from "@/components/ui/input";
import { WalletDeleteConfirm } from "./wallet-delete-confirm";
import type { WalletDto } from "@/hooks/use-wallets";

type WalletType = WalletDto["walletType"];

interface PersistedProps {
  mode: "persisted";
  wallet: WalletDto;
  budgetCurrency: string;
  // UAT-PH5-T3-14: sum of currentBalanceCents across all wallets in the same
  // section, supplied by WalletSection. Used to compute the Share column.
  sectionTotalCents: number;
  onUpdate: (patch: {
    name?: string;
    amount?: string;
    currency?: string;
  }) => Promise<void>;
  onArchive: () => void;
  isReserveSection: boolean;
}

interface DraftProps {
  mode: "draft";
  sectionType: WalletType;
  budgetCurrency: string;
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
      <div className="w-[72px] sm:w-[96px]">
        <span
          className="text-[var(--muted-foreground)]"
          aria-label={t("currencyReadOnlyAria", { ccy: budgetCurrency })}
        >
          {budgetCurrency}
        </span>
      </div>

      {/* Amount — always 0.00 in draft state */}
      <div className="w-[120px] text-right sm:w-[160px]">
        <span className="text-num-md text-[var(--muted-foreground)]">0.00</span>
      </div>

      {/* UAT-PH5-T3-14: Share placeholder for column alignment with persisted rows */}
      <div
        className="w-[64px] text-right text-num-sm text-[var(--muted-foreground)] sm:w-[80px]"
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
  onUpdate,
  onArchive,
  isReserveSection,
}: PersistedProps) {
  const t = useTranslations("bdp.tab.wallets.row");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selected, setSelected] = useState(false);

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: wallet.id,
  });

  // Mobile: first tap on row → selected state (reveals trash)
  const handleRowClick = (e: React.MouseEvent) => {
    // Only for non-cell clicks on mobile
    const target = e.target as HTMLElement;
    if (target.closest("[data-inline-cell]") || target.closest("button")) {
      return;
    }
    setSelected((s) => !s);
  };

  return (
    <div
      ref={setNodeRef}
      data-testid="wallet-row"
      data-wallet-id={wallet.id}
      data-selected={selected || undefined}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      onClick={handleRowClick}
      className="group flex min-h-[56px] items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 hover:bg-[var(--surface-elevated-dark)] sm:min-h-[48px]"
    >
      <RowDragHandle
        name={wallet.name || "wallet"}
        listeners={listeners}
        attributes={attributes}
        ariaLabel={t("dragHandleAria", { name: wallet.name })}
      />

      {/* Name — editable */}
      <div className="flex-1" data-inline-cell>
        <InlineEditCell
          value={wallet.name}
          ariaLabel={t("nameAria")}
          testId={`wallet-name-${wallet.id}`}
          render={(v) => (
            <span>
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

      {/* Currency — read-only for Reserve section per D-PH5-R3; editable otherwise */}
      <div className="w-[72px] sm:w-[96px]" data-inline-cell>
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
           onSave sends it directly as the decimal amount string. */}
      <div className="w-[120px] text-right sm:w-[160px]" data-inline-cell>
        <InlineEditCell
          value={(Number(wallet.currentBalanceCents) / 100).toFixed(2)}
          ariaLabel={t("amountAria")}
          testId={`wallet-amount-${wallet.id}`}
          render={(v) => (
            <span className="text-num-md">{v}</span>
          )}
          renderEditor={(draft, onChange) => (
            <Input
              autoFocus
              type="text"
              inputMode="decimal"
              defaultValue={draft}
              onChange={(e) => onChange(e.target.value)}
              className="h-9 text-right"
            />
          )}
          onSave={(v) => onUpdate({ amount: v })}
        />
      </div>

      {/* UAT-PH5-T3-14: Share — wallet's slice of its section's total.
          Em-dash when the section sum is zero (no meaningful ratio). */}
      <div
        data-testid={`wallet-share-${wallet.id}`}
        className="w-[64px] text-right text-num-sm text-[var(--muted-foreground)] sm:w-[80px]"
        aria-label={t("shareAria", { name: wallet.name })}
      >
        {sectionTotalCents > 0
          ? `${((Number(wallet.currentBalanceCents) / sectionTotalCents) * 100).toFixed(0)}%`
          : "—"}
      </div>

      {/* Trash — desktop: hover; mobile: first-tap selected state */}
      <button
        data-testid={`wallet-trash-${wallet.id}`}
        aria-label={t("trashAria", { name: wallet.name })}
        onClick={(e) => {
          e.stopPropagation();
          setConfirmOpen(true);
        }}
        className={[
          "flex h-7 w-7 items-center justify-center rounded",
          "text-[var(--destructive)]",
          // UAT-PH5-T3-12: keep the slot in layout always so the row never
          // jumps width/height on hover. Toggle visibility instead of mount.
          // Desktop: reveal on hover via group; mobile: reveal on selected.
          "invisible group-hover:visible",
          selected ? "!visible" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
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
