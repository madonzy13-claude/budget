"use client";
/**
 * holding-sheet.tsx — Type-first add / edit holding Sheet (Phase 9.1).
 *
 * The FIRST field is Type; the chosen UI type drives which fields render and how
 * the holding is priced (see lib/investment-types.ts):
 *   tracked (equity/etf/etb/reit/crypto) — Asset autocomplete (filtered to the
 *     type) + buy price/ccy + quantity + read-only fetched current price.
 *   manual (treasury_bond/collectibles/real_estate/other) — name + buy price/ccy +
 *     quantity + editable current price.
 *   precious_metals — name + metal + kind + UoM + quantity + buy price/ccy +
 *     fetched-and-converted read-only current price (spot/oz → UoM).
 *   cash — name + currency + amount.
 * Group is optional on every type. shadcn <Sheet side="right"> (controlled, no
 * trigger). Optimistic save via the create/update hooks; discard-confirm on dirty.
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  TrendingUp,
  BarChart2,
  Landmark,
  Building2,
  Bitcoin,
  Gem,
  Home,
  MoreHorizontal,
  Coins,
  Banknote,
  type LucideIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  UI_TYPE_META,
  UI_TYPE_ORDER,
  METAL_TO_SYMBOL,
  METALS,
  METAL_KINDS,
  UOMS,
  OZ_PER_UNIT,
  deriveUiType,
  type UiType,
  type Metal,
  type MetalKind,
  type Uom,
} from "@/lib/investment-types";
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
  groups: string[];
  holding?: HoldingDto | null;
}

const UI_TYPE_ICON: Record<UiType, LucideIcon> = {
  equity: TrendingUp,
  etf: BarChart2,
  etb: Landmark,
  reit: Building2,
  crypto: Bitcoin,
  treasury_bond: Landmark,
  collectibles: Gem,
  real_estate: Home,
  other: MoreHorizontal,
  precious_metals: Coins,
  cash: Banknote,
};

/** Decimal string → integer-cents string, or null. */
function toCents(value: string): string | null {
  const n = Number(value.replace(/\s/g, "").replace(/,/g, ".").trim());
  if (!value.trim() || !Number.isFinite(n)) return null;
  return String(Math.round(n * 100));
}
function centsToDecimal(cents: string | null): string {
  if (cents == null) return "";
  const n = Number(cents);
  return Number.isFinite(n) ? String(n / 100) : "";
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

  const [uiType, setUiType] = useState<UiType>(
    holding
      ? deriveUiType(holding.uiType, holding.holdingType, holding.isCustom)
      : "equity",
  );
  const [name, setName] = useState(holding?.name ?? "");
  const [instrumentId, setInstrumentId] = useState<string | null>(
    holding?.instrumentId ?? null,
  );
  const [buyPrice, setBuyPrice] = useState(
    centsToDecimal(holding?.buyPriceCents ?? null),
  );
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
  const [group, setGroup] = useState<string | null>(holding?.group ?? null);
  const [metal, setMetal] = useState<Metal>(
    (holding?.metal as Metal) ?? "gold",
  );
  const [metalKind, setMetalKind] = useState<MetalKind>(
    (holding?.metalKind as MetalKind) ?? "coin",
  );
  const [uom, setUom] = useState<Uom>((holding?.unitOfMeasure as Uom) ?? "g");
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [priceBlocked, setPriceBlocked] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const behavior = UI_TYPE_META[uiType].behavior;
  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

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
        },
      );
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

  /** Resolve a metal to its spot instrument id, then fetch its price. */
  async function resolveMetal(m: Metal) {
    const symbol = METAL_TO_SYMBOL[m];
    const q = symbol.split("/")[0]; // "XAU"
    try {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investments/search?q=${encodeURIComponent(q)}&type=commodity`,
        { signal: AbortSignal.timeout(7000) },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { results?: InstrumentSuggestion[] };
      const hit = (json.results ?? []).find((r) => r.symbol === symbol);
      if (hit) {
        setInstrumentId(hit.id);
        setCurrentPriceCurrency(hit.quoteCurrency ?? "USD");
        void fetchPrice(hit.id);
      }
    } catch {
      /* best-effort */
    }
  }

  function changeType(next: UiType) {
    markDirty();
    setUiType(next);
    // Reset type-specific fields so stale values don't leak across behaviors.
    setInstrumentId(null);
    setName("");
    setCurrentPrice("");
    setPriceBlocked(false);
    if (UI_TYPE_META[next].behavior === "metals") {
      setMetal("gold");
      setMetalKind("coin");
      setUom("g");
      void resolveMetal("gold");
    }
  }

  function selectInstrument(inst: InstrumentSuggestion) {
    markDirty();
    setInstrumentId(inst.id);
    setName(inst.displayName);
    if (inst.quoteCurrency) {
      setBuyCurrency(inst.quoteCurrency);
      setCurrentPriceCurrency(inst.quoteCurrency);
    }
    void fetchPrice(inst.id);
  }

  // Read-only current-price preview (metals: spot/oz converted to the UoM).
  const currentPricePreview = useMemo(() => {
    if (!currentPrice) return "";
    if (behavior === "metals") {
      const perUnit = Number(currentPrice) * OZ_PER_UNIT[uom];
      return Number.isFinite(perUnit) ? perUnit.toFixed(2) : "";
    }
    return currentPrice;
  }, [currentPrice, behavior, uom]);

  const canSave = useMemo(() => {
    if (priceBlocked) return false;
    switch (behavior) {
      case "tracked":
        return instrumentId != null && !!currentPrice.trim();
      case "metals":
        return (
          !!name.trim() &&
          !!quantity.trim() &&
          instrumentId != null &&
          !!currentPrice.trim()
        );
      case "cash":
        return !!name.trim() && !!currentPrice.trim();
      case "manual":
      default:
        return !!name.trim() && !!currentPrice.trim();
    }
  }, [behavior, priceBlocked, instrumentId, currentPrice, name, quantity]);

  function attemptClose() {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function buildPayload() {
    const holdingType = UI_TYPE_META[uiType].holdingType as HoldingType;
    const common = { uiType, holdingType, group };
    if (behavior === "cash") {
      return {
        ...common,
        name: name.trim(),
        quantity: "1",
        currentPriceCents: toCents(currentPrice),
        currentPriceCurrency,
        buyCurrency: currentPriceCurrency,
      };
    }
    if (behavior === "metals") {
      return {
        ...common,
        name: name.trim(),
        instrumentId,
        metal,
        metalKind,
        unitOfMeasure: uom,
        quantity,
        buyPriceCents: toCents(buyPrice),
        buyCurrency,
        currentPriceCents: toCents(currentPrice),
        currentPriceCurrency,
      };
    }
    if (behavior === "tracked") {
      return {
        ...common,
        name: name.trim(),
        instrumentId,
        buyPriceCents: toCents(buyPrice),
        buyCurrency,
        quantity,
        currentPriceCents: toCents(currentPrice),
        currentPriceCurrency,
      };
    }
    // manual
    return {
      ...common,
      name: name.trim(),
      buyPriceCents: toCents(buyPrice),
      buyCurrency,
      quantity,
      currentPriceCents: toCents(currentPrice),
      currentPriceCurrency,
    };
  }

  function handleSave() {
    if (!canSave) return;
    const payload = buildPayload();
    if (mode === "create") {
      createMut.mutate(payload as Parameters<typeof createMut.mutate>[0]);
    } else if (holding) {
      updateMut.mutate({
        holdingId: holding.id,
        ...payload,
      } as Parameters<typeof updateMut.mutate>[0]);
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
          {/* 1. Type — always first; drives the rest of the form. */}
          <Field label={t("field.type")}>
            <Select
              value={uiType}
              onValueChange={(v) => changeType(v as UiType)}
            >
              <SelectTrigger
                aria-label={t("field.type")}
                data-testid="holding-sheet-type"
              >
                <SelectValue>
                  <span className="flex items-center gap-2">
                    {(() => {
                      const Icon = UI_TYPE_ICON[uiType];
                      return (
                        <Icon className="h-4 w-4 text-[var(--body-on-dark)]" />
                      );
                    })()}
                    <span>{t(`uitype.${uiType}`)}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {UI_TYPE_ORDER.map((tp) => {
                  const Icon = UI_TYPE_ICON[tp];
                  return (
                    <SelectItem
                      key={tp}
                      value={tp}
                      data-testid={`holding-type-${tp}`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />
                        <span>{t(`uitype.${tp}`)}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>

          {/* 2. Name / Asset */}
          {behavior === "tracked" ? (
            <Field label={t("field.asset")}>
              <InstrumentSearchInput
                budgetId={budgetId}
                assetClass={UI_TYPE_META[uiType].assetClass}
                hideCustom
                name={name}
                onNameChange={(v) => {
                  markDirty();
                  setName(v);
                  if (instrumentId != null) setInstrumentId(null);
                }}
                onSelectInstrument={selectInstrument}
                onSelectCustom={() => {}}
                autoFocus={mode === "create"}
              />
            </Field>
          ) : (
            <Field label={t("field.name")}>
              <Input
                data-testid="holding-sheet-name"
                autoFocus={mode === "create"}
                value={name}
                onChange={(e) => {
                  markDirty();
                  setName(e.target.value);
                }}
              />
            </Field>
          )}

          {/* 3. Metals: metal + kind + UoM */}
          {behavior === "metals" && (
            <>
              <Field label={t("field.metal")}>
                <SimpleSelect
                  testId="holding-sheet-metal"
                  value={metal}
                  options={METALS.map((m) => ({
                    value: m,
                    label: t(`metalOption.${m}`),
                  }))}
                  onChange={(v) => {
                    markDirty();
                    setMetal(v as Metal);
                    void resolveMetal(v as Metal);
                  }}
                  ariaLabel={t("field.metal")}
                />
              </Field>
              <Field label={t("field.kind")}>
                <SimpleSelect
                  testId="holding-sheet-kind"
                  value={metalKind}
                  options={METAL_KINDS.map((k) => ({
                    value: k,
                    label: t(`kindOption.${k}`),
                  }))}
                  onChange={(v) => {
                    markDirty();
                    setMetalKind(v as MetalKind);
                  }}
                  ariaLabel={t("field.kind")}
                />
              </Field>
              <Field label={t("field.uom")}>
                <SimpleSelect
                  testId="holding-sheet-uom"
                  value={uom}
                  options={UOMS.map((u) => ({
                    value: u,
                    label: t(`uomOption.${u}`),
                  }))}
                  onChange={(v) => {
                    markDirty();
                    setUom(v as Uom);
                  }}
                  ariaLabel={t("field.uom")}
                />
              </Field>
            </>
          )}

          {/* 4. Cash: currency + amount */}
          {behavior === "cash" ? (
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
              {/* 5. Buy price + currency + quantity (tracked / manual / metals) */}
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

              {/* 6. Current price */}
              <Field label={t("field.currentPrice")}>
                {behavior === "manual" ? (
                  <NumericInput
                    testId="holding-sheet-amount"
                    value={currentPrice}
                    onChange={(v) => {
                      markDirty();
                      setCurrentPrice(v);
                    }}
                    placeholder={buyPrice}
                  />
                ) : (
                  <div className="space-y-1">
                    <p
                      data-testid="holding-sheet-current-price"
                      className="text-num-md text-[var(--body-on-dark)]"
                    >
                      {currentPricePreview
                        ? `${currentPricePreview} ${currentPriceCurrency}`
                        : "—"}
                    </p>
                    <p className="text-caption text-[var(--muted-foreground)]">
                      {t("field.lastUpdated", { relativeTime: t("field.now") })}
                    </p>
                  </div>
                )}
              </Field>
            </>
          )}

          {/* 7. Group (all types) */}
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
              onRetry={() => {
                if (behavior === "metals") void resolveMetal(metal);
                else if (instrumentId) void fetchPrice(instrumentId);
              }}
              retrying={retrying}
            />
          )}
        </div>

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

function SimpleSelect({
  value,
  options,
  onChange,
  testId,
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
