"use client";
/**
 * holding-sheet.tsx — Add / edit holding Sheet (Phase 9, INV-05/06/14).
 *
 * shadcn <Sheet side="right">, controlled open/onOpenChange (NO SheetTrigger —
 * the trigger is the dashed add button or a row's pen). Single scrolling form
 * with three variants per 09-UI-SPEC §Sheet Form Layout:
 *   - tracked (instrument linked): current price read-only (cron-owned).
 *   - custom (no instrument):      current price editable, prefilled to buy price.
 *   - cash_fx:                     currency + amount + group only (no P/L).
 * Footer: Save (the ONE yellow CTA), Cancel (ghost + discard-confirm on dirty),
 * Archive (edit mode, ghost Trash2). Submits optimistically via the create /
 * update hooks. An on-add price-fetch failure renders <PriceBlockedBanner> and
 * blocks save (A2).
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyPicker } from "@/components/common/currency-picker";
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
import { clientApiFetch } from "@/lib/budget-fetch";
import { useCreateHolding } from "@/hooks/use-create-holding";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import type { HoldingDto, HoldingType } from "@/hooks/use-investments";
import { TypeDropdown } from "./type-dropdown";
import { GroupCombobox } from "./group-combobox";
import { PriceBlockedBanner } from "./price-blocked-banner";
import {
  InstrumentSearchInput,
  type InstrumentSuggestion,
} from "./instrument-search-input";

interface HoldingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  budgetId: string;
  budgetCurrency: string;
  /** Distinct existing group names for the combobox. */
  groups: string[];
  /** Present in edit mode. */
  holding?: HoldingDto | null;
}

/** Map a raw instrument asset_class string to a holding type enum value. */
function assetClassToType(assetClass: string): HoldingType {
  const a = assetClass.toLowerCase();
  if (a.includes("etf")) return "etf";
  if (a.includes("crypto")) return "crypto";
  if (a.includes("bond")) return "bond";
  if (a.includes("reit")) return "reit";
  if (a.includes("commodity") || a.includes("metal")) return "commodity";
  if (a.includes("cash") || a.includes("fx")) return "cash_fx";
  if (a.includes("real")) return "real_estate";
  if (a.includes("equit") || a.includes("stock")) return "equities";
  return "other";
}

/** Decimal string ("1.234,56" / "12.5") → integer-cents string, or null. */
function toCents(value: string): string | null {
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").trim();
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * 100));
}

/** Integer-cents string → editable decimal string. */
function centsToDecimal(cents: string | null): string {
  if (cents == null) return "";
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  return String(n / 100);
}

export function HoldingSheet({
  open,
  onOpenChange,
  mode,
  budgetId,
  budgetCurrency,
  groups,
  holding,
}: HoldingSheetProps) {
  const t = useTranslations("budget.investments");
  const createMut = useCreateHolding(budgetId);
  const updateMut = useUpdateHolding(budgetId);

  // ── Form state (re-seeded per open via the `key` on the Sheet content) ──
  const [name, setName] = useState(holding?.name ?? "");
  const [holdingType, setHoldingType] = useState<HoldingType>(
    holding?.holdingType ?? "other",
  );
  const [group, setGroup] = useState<string | null>(holding?.group ?? null);
  const [instrumentId, setInstrumentId] = useState<string | null>(
    holding?.instrumentId ?? null,
  );
  const [buyPrice, setBuyPrice] = useState(centsToDecimal(holding?.buyPriceCents ?? null));
  const [buyCurrency, setBuyCurrency] = useState(
    holding?.buyCurrency ?? budgetCurrency,
  );
  const [quantity, setQuantity] = useState(holding?.quantity ?? "1");
  const [currentPrice, setCurrentPrice] = useState(
    centsToDecimal(holding?.currentPriceCents ?? null),
  );
  const [currentPriceCurrency, setCurrentPriceCurrency] = useState(
    holding?.currentPriceCurrency ?? budgetCurrency,
  );
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [priceBlocked, setPriceBlocked] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const isTracked = instrumentId != null;
  const isCash = holdingType === "cash_fx";
  // tracked = instrument-linked; price is cron-owned → read-only.

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  /** On-add instant price fetch for a tracked instrument (A2). */
  async function fetchPrice(id: string) {
    setRetrying(true);
    setPriceBlocked(false);
    try {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investments/price/${id}`,
        {
          method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        setPriceBlocked(true);
        return;
      }
      const json = (await res.json()) as {
        priceCents?: string | number;
        price?: string | number;
        currency?: string;
      };
      const cents =
        json.priceCents != null
          ? String(json.priceCents)
          : json.price != null
            ? toCents(String(json.price))
            : null;
      if (cents != null) setCurrentPrice(centsToDecimal(cents));
      if (json.currency) setCurrentPriceCurrency(json.currency);
    } catch {
      setPriceBlocked(true);
    } finally {
      setRetrying(false);
    }
  }

  function selectInstrument(inst: InstrumentSuggestion) {
    markDirty();
    setInstrumentId(inst.id);
    setName(inst.displayName);
    setHoldingType(assetClassToType(inst.assetClass));
    if (inst.quoteCurrency) {
      setBuyCurrency(inst.quoteCurrency);
      setCurrentPriceCurrency(inst.quoteCurrency);
    }
    void fetchPrice(inst.id);
  }

  function selectCustom() {
    markDirty();
    setInstrumentId(null);
    setPriceBlocked(false);
  }

  const canSave = useMemo(() => {
    if (priceBlocked) return false;
    if (!name.trim()) return false;
    if (isCash) return !!currentPrice.trim();
    if (isTracked) return true; // price comes from the server
    return !!currentPrice.trim(); // custom needs a value
  }, [priceBlocked, name, isCash, isTracked, currentPrice]);

  function attemptClose() {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  async function handleSave() {
    if (!canSave) return;
    if (mode === "create") {
      if (isCash) {
        createMut.mutate({
          name: name.trim(),
          holdingType: "cash_fx",
          group,
          quantity: "1",
          currentPriceCents: toCents(currentPrice),
          currentPriceCurrency,
          buyCurrency: currentPriceCurrency,
        });
      } else if (isTracked) {
        createMut.mutate({
          name: name.trim(),
          holdingType,
          group,
          instrumentId,
          buyPriceCents: toCents(buyPrice),
          buyCurrency,
          quantity,
          currentPriceCents: toCents(currentPrice),
          currentPriceCurrency,
        });
      } else {
        // custom: current price editable; defaults to buy price if untouched.
        const cp = toCents(currentPrice) ?? toCents(buyPrice);
        createMut.mutate({
          name: name.trim(),
          holdingType,
          group,
          buyPriceCents: toCents(buyPrice),
          buyCurrency,
          quantity,
          currentPriceCents: cp,
          currentPriceCurrency,
        });
      }
    } else if (holding) {
      updateMut.mutate({
        holdingId: holding.id,
        name: name.trim(),
        holdingType,
        group,
        ...(isCash || !isTracked
          ? { currentPriceCents: toCents(currentPrice) }
          : {}),
        ...(isCash ? {} : { buyPriceCents: toCents(buyPrice), quantity }),
      });
    }
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          attemptClose();
          return;
        }
        onOpenChange(true);
      }}
    >
      <SheetContent
        side="right"
        data-testid="holding-sheet"
        className="flex w-full flex-col bg-[var(--canvas-dark)] sm:max-w-[480px]"
      >
        <SheetHeader className="mb-2">
          <SheetTitle className="text-[var(--body-on-dark)]">
            {mode === "create" ? t("sheet.title.add") : t("sheet.title.edit")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-4">
          {/* 1. Name / Instrument */}
          <Field label={t("field.name")}>
            <InstrumentSearchInput
              budgetId={budgetId}
              name={name}
              onNameChange={(v) => {
                markDirty();
                setName(v);
                // Free-typing a name detaches any selected instrument → custom.
                if (instrumentId != null) setInstrumentId(null);
              }}
              onSelectInstrument={selectInstrument}
              onSelectCustom={selectCustom}
              autoFocus={mode === "create"}
            />
          </Field>

          {/* Type (all variants — cash_fx preselected but reclassifiable). */}
          <Field label={t("field.type")}>
            <TypeDropdown
              value={holdingType}
              onChange={(v) => {
                markDirty();
                setHoldingType(v);
              }}
              aria-label={t("field.type")}
            />
          </Field>

          {/* Cash variant: currency + amount + group only. */}
          {isCash ? (
            <>
              <Field label={t("field.currency")}>
                <CurrencyPicker
                  variant="field"
                  value={currentPriceCurrency}
                  onSelect={(v) => {
                    markDirty();
                    setCurrentPriceCurrency(v);
                  }}
                  aria-label={t("field.currency")}
                />
              </Field>
              <Field label={t("field.amount")}>
                <NumericInput
                  testId="holding-sheet-amount"
                  value={currentPrice}
                  onChange={(v) => {
                    markDirty();
                    setCurrentPrice(v);
                  }}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t("field.buyPrice")}>
                <NumericInput
                  testId="holding-sheet-buy-price"
                  value={buyPrice}
                  onChange={(v) => {
                    markDirty();
                    setBuyPrice(v);
                  }}
                />
              </Field>
              <Field label={t("field.buyCurrency")}>
                <CurrencyPicker
                  variant="field"
                  value={buyCurrency}
                  onSelect={(v) => {
                    markDirty();
                    setBuyCurrency(v);
                  }}
                  aria-label={t("field.buyCurrency")}
                />
              </Field>
              <Field label={t("field.quantity")}>
                <NumericInput
                  testId="holding-sheet-quantity"
                  value={quantity}
                  onChange={(v) => {
                    markDirty();
                    setQuantity(v);
                  }}
                />
              </Field>
              <Field label={t("field.currentPrice")}>
                {isTracked ? (
                  <div className="space-y-1">
                    <p className="text-num-md text-[var(--body-on-dark)]">
                      {currentPrice
                        ? `${currentPrice} ${currentPriceCurrency}`
                        : "—"}
                    </p>
                    <p className="text-caption text-[var(--muted-foreground)]">
                      {t("field.lastUpdated", { relativeTime: t("field.now") })}
                    </p>
                  </div>
                ) : (
                  <NumericInput
                    testId="holding-sheet-amount"
                    value={currentPrice}
                    onChange={(v) => {
                      markDirty();
                      setCurrentPrice(v);
                    }}
                    placeholder={buyPrice}
                  />
                )}
              </Field>
            </>
          )}

          {/* Group (all variants) */}
          <Field label={t("field.group")}>
            <GroupCombobox
              value={group}
              groups={groups}
              onChange={(v) => {
                markDirty();
                setGroup(v);
              }}
              aria-label={t("field.group")}
            />
          </Field>

          {priceBlocked && (
            <PriceBlockedBanner
              onRetry={() => instrumentId && void fetchPrice(instrumentId)}
              retrying={retrying}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[var(--hairline-dark)] pt-4">
          <Button
            type="button"
            variant="primary"
            data-testid="holding-sheet-submit"
            disabled={!canSave}
            onClick={handleSave}
            className="flex-1"
          >
            {t("sheet.save")}
          </Button>
          <Button type="button" variant="ghost" onClick={attemptClose}>
            {t("sheet.cancel")}
          </Button>
        </div>
      </SheetContent>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.discard.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.discard.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirm.discard.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              {t("confirm.discard.cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-caption text-[var(--muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Decimal numeric input — comma AND dot accepted (D-15). */
function NumericInput({
  value,
  onChange,
  testId,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
  placeholder?: string;
}) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      data-testid={testId}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="text-num-md tabular-nums"
    />
  );
}
