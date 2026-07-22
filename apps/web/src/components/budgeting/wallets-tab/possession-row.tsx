"use client";
/**
 * possession-row.tsx — inline-editable possession row (same model as wallet-row).
 *
 * mode="persisted" — icon picker + inline name + currency + inline value + trash.
 *   All edits are inline (InlineEditCell / CurrencyPicker / WalletCustomizer) — no
 *   sub sheet, mirroring the spendings/reserve/cushion wallet rows.
 * mode="draft" — staged-add row: an empty auto-focused name input that POSTs on a
 *   non-empty blur (value/currency/icon are then edited inline on the new row).
 */
import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { useIsWide } from "@/hooks/use-is-wide";
import { SwipeToDeleteRow } from "@/components/common/swipe-to-delete-row";
import { HoldingDeleteConfirm } from "./holding-delete-confirm";
import { Input } from "@/components/ui/input";
import { centsToBare } from "@/lib/cents-format";
import { WalletCustomizer } from "./wallet-customizer";
import { sanitizeAmount } from "./wallet-row";
import { POSSESSION_ICONS } from "@/lib/possession-icons";
import type { HoldingDto } from "@/hooks/use-investments";

const MIN_AMOUNT_CHARS = 4;

export interface PossessionUpdate {
  name?: string;
  amount?: string; // decimal string
  currency?: string;
  icon?: string | null;
  color?: string | null;
}

interface PersistedProps {
  mode: "persisted";
  holding: HoldingDto;
  maxAmountChars?: number;
  onUpdate: (patch: PossessionUpdate) => Promise<void>;
  onArchive: () => void;
}

interface DraftProps {
  mode: "draft";
  budgetCurrency: string;
  maxAmountChars?: number;
  onCommit: (name: string) => Promise<void>;
  onDiscard: () => void;
  pending: boolean;
}

export function PossessionRow(props: PersistedProps | DraftProps) {
  return props.mode === "draft" ? (
    <DraftRow {...props} />
  ) : (
    <PersistedRow {...props} />
  );
}

function DraftRow({
  budgetCurrency,
  maxAmountChars,
  onCommit,
  onDiscard,
  pending,
}: DraftProps) {
  const t = useTranslations("budget.possessions");
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleBlur = async () => {
    const trimmed = name.trim();
    if (!trimmed) return onDiscard();
    await onCommit(trimmed);
  };

  return (
    <div
      data-testid="possession-row-draft"
      className="flex min-h-[56px] items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px]"
    >
      <div className="size-7 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Escape") onDiscard();
            if (e.key === "Enter") inputRef.current?.blur();
          }}
          disabled={pending}
          placeholder={t("field.namePlaceholder")}
          className="h-9"
          aria-label={t("row.nameAria")}
          data-testid="possession-draft-name-input"
        />
      </div>
      <div className="w-[44px] text-[var(--muted-foreground)] sm:w-[96px]">
        {budgetCurrency}
      </div>
      <div
        className="text-right tabular-nums text-[var(--muted-foreground)]"
        style={{ minWidth: `${(maxAmountChars ?? MIN_AMOUNT_CHARS) + 1}ch` }}
      >
        0
      </div>
      <div className="w-7" aria-hidden="true" />
    </div>
  );
}

function PersistedRow({
  holding,
  maxAmountChars,
  onUpdate,
  onArchive,
}: PersistedProps) {
  const t = useTranslations("budget.possessions");
  const locale = useLocale();
  const wide = useIsWide(); // full currency name in the picker on desktop (≥md)
  const currency = holding.currentPriceCurrency ?? holding.buyCurrency ?? "";
  const valueCents = holding.currentPriceCents ?? "0";
  // Delete goes through a confirm dialog (same as the spendings/wallet delete) —
  // both the desktop trash and the mobile swipe open it; only confirm archives.
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <SwipeToDeleteRow
      onDelete={() => setConfirmOpen(true)}
      deleteAriaLabel={t("row.deleteAria", { name: holding.name })}
    >
      <div
        data-testid={`possession-row-${holding.name}`}
        data-nav-item
        data-nav-type="possession"
        data-nav-key={`poss-${holding.id}`}
        className="group relative flex min-h-[56px] w-full items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 hover:bg-[var(--surface-elevated-dark)] data-[nav-highlighted=true]:bg-[var(--surface-elevated-dark)] sm:min-h-[48px]"
      >
        {/* Icon + color — inline picker (curated possession icon set), same as the
          wallet/spendings customizer. */}
        <WalletCustomizer
          color={holding.color ?? null}
          icon={holding.icon ?? null}
          icons={POSSESSION_ICONS}
          ariaLabel={t("row.iconAria", { name: holding.name })}
          onChange={(patch) => onUpdate(patch).catch(() => {})}
        />

        {/* Name — inline edit. */}
        <div
          className="min-w-0 flex-1 rounded data-[nav-field-active=true]:ring-1 data-[nav-field-active=true]:ring-[var(--primary)]"
          data-inline-cell
          data-nav-field="name"
        >
          <InlineEditCell
            value={holding.name}
            ariaLabel={t("row.nameAria")}
            testId={`possession-name-${holding.id}`}
            render={(v) => <span className="block truncate">{v}</span>}
            renderEditor={(draft, onChange) => (
              <Input
                autoFocus
                value={draft}
                onChange={(e) => onChange(e.target.value)}
                className="h-9"
                placeholder={t("field.namePlaceholder")}
              />
            )}
            onSave={(v) => {
              // Empty name is invalid — show a direct message and keep the old name
              // (no server round-trip → no generic "couldn't save" error).
              if (!v.trim()) {
                toast.error(t("row.nameRequired"));
                return Promise.resolve();
              }
              return onUpdate({ name: v.trim() });
            }}
          />
        </div>

        {/* Currency — inline picker (full name on desktop, like wallets). */}
        <div
          className="w-[44px] rounded data-[nav-field-active=true]:ring-1 data-[nav-field-active=true]:ring-[var(--primary)] sm:w-[96px] md:w-[190px]"
          data-inline-cell
          data-nav-field="currency"
        >
          <CurrencyPicker
            value={currency}
            aria-label={t("row.currencyAria")}
            onSelect={(v: string) => onUpdate({ currency: v })}
            richLabel={wide}
            desktopDropdown={wide}
          />
        </div>

        {/* Value — inline edit. */}
        <div
          className="rounded text-right tabular-nums data-[nav-field-active=true]:ring-1 data-[nav-field-active=true]:ring-[var(--primary)]"
          style={{ minWidth: `${(maxAmountChars ?? MIN_AMOUNT_CHARS) + 1}ch` }}
          data-inline-cell
          data-nav-field="amount"
        >
          <InlineEditCell
            value={centsToBare(valueCents).replace(/[^0-9.-]/g, "")}
            ariaLabel={t("row.amountAria")}
            testId={`possession-amount-${holding.id}`}
            render={() => (
              <span className="text-num-md">
                {centsToBare(valueCents, locale)}
              </span>
            )}
            renderEditor={(draft, onChange) => (
              <Input
                autoFocus
                type="text"
                inputMode="decimal"
                defaultValue={draft}
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

        {/* Trash — desktop only, hover-revealed. Mobile deletes via swipe-left
          (SwipeToDeleteRow), same as the wallet rows. */}
        <button
          type="button"
          data-testid={`possession-trash-${holding.id}`}
          data-nav-delete
          aria-label={t("row.deleteAria", { name: holding.name })}
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--destructive)] sm:flex sm:invisible sm:group-hover:visible sm:group-data-[nav-highlighted=true]:visible"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <HoldingDeleteConfirm
          name={holding.name}
          namespace="budget.possessions.confirm.delete"
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={() => {
            onArchive();
            setConfirmOpen(false);
          }}
        />
      </div>
    </SwipeToDeleteRow>
  );
}
