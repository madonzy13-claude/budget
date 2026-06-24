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
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UI_TYPE_ICON } from "@/lib/investment-icons";
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
  isAutoPriced,
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

  // Create mode starts with NO type chosen ("") so nothing is preselected; edit
  // mode derives the existing holding's type.
  const [uiType, setUiType] = useState<UiType | "">(
    holding
      ? deriveUiType(holding.uiType, holding.holdingType, holding.isCustom)
      : "",
  );
  const [name, setName] = useState(holding?.name ?? "");
  const [instrumentId, setInstrumentId] = useState<string | null>(
    holding?.instrumentId ?? null,
  );
  // Price provider of the selected instrument. 'manual' (non-US equities/ETF) ⇒
  // the user enters the price; auto providers ⇒ read-only fetched price.
  const [instrumentProvider, setInstrumentProvider] = useState<string | null>(
    holding?.instrumentProvider ?? null,
  );
  // A tracked type where the user chose "enter manually" (ticker not in the
  // catalog): no instrument, editable price, currency picker visible. In edit mode,
  // a tracked-type holding that has no instrument is exactly this case.
  const isManualTracked = (h: HoldingDto): boolean => {
    if (h.instrumentId != null) return false;
    const ut = deriveUiType(h.uiType, h.holdingType, h.isCustom);
    return UI_TYPE_META[ut].behavior === "tracked";
  };
  const [manualEntry, setManualEntry] = useState(
    !!holding && isManualTracked(holding),
  );
  // Ticker: a selected instrument's symbol (read-only, for the optimistic row) OR
  // the user-typed ticker in manual entry. For a manual-tracked holding in edit
  // mode, `symbol` already holds the manual ticker (COALESCE on read).
  const [symbol, setSymbol] = useState<string | null>(holding?.symbol ?? null);
  const [manualTicker, setManualTicker] = useState(
    holding && isManualTracked(holding) ? (holding.symbol ?? "") : "",
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

  // Controlled Type-dropdown open state. On touch, Radix closes the open dropdown
  // on the trigger tap (pointer-down-outside) and then the trigger reopens it in
  // the same gesture → it never closes. Suppress any "open" that fires right
  // after a "close" so a trigger tap reliably toggles it shut. Open by default on
  // create so the user sees the type options immediately on opening the sheet.
  const [typeOpen, setTypeOpen] = useState(mode === "create");
  const reopenBlockUntil = useRef(0);
  const onTypeOpenChange = (next: boolean) => {
    const now = Date.now();
    if (next && now < reopenBlockUntil.current) return;
    if (!next) reopenBlockUntil.current = now + 300;
    setTypeOpen(next);
  };

  const meta = uiType ? UI_TYPE_META[uiType] : null;
  const behavior = meta?.behavior ?? null;
  // A tracked type whose price the user enters by hand: either a selected non-US
  // instrument (provider='manual', no free quote) OR a manual entry (ticker not in
  // the catalog, no instrument). Both ⇒ editable current-price field.
  const trackedManual =
    behavior === "tracked" &&
    (manualEntry ||
      (instrumentId != null && !isAutoPriced(instrumentProvider)));
  // Currency comes FROM a selected instrument, so hide the picker once one is
  // chosen; show it only when the user supplies the value by hand (manual / cash /
  // broker / manual-entry tracked with no instrument). Metals are the exception:
  // the spot is USD but the user picks the currency to value the coins in (the
  // fetched price is FX-converted to it).
  const showBuyCurrency = instrumentId == null || behavior === "metals";
  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  async function fetchPrice(id: string, targetCurrency?: string) {
    setRetrying(true);
    setPriceBlocked(false);
    try {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investments/price/${id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Metals: ask for the price in the user's chosen currency (USD → ccy).
          body: JSON.stringify(targetCurrency ? { currency: targetCurrency } : {}),
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

  /** Resolve a metal to its spot instrument id, then fetch its (FX-converted) price
   *  in `ccy` (defaults to the currently selected value currency). */
  async function resolveMetal(m: Metal, ccy?: string) {
    const symbol = METAL_TO_SYMBOL[m];
    const q = symbol.split("/")[0]; // "XAU"
    const target = ccy ?? currentPriceCurrency;
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
        // The fetched price is converted to `target`, so value the holding in it.
        setCurrentPriceCurrency(target);
        void fetchPrice(hit.id, target);
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
    setInstrumentProvider(null);
    setManualEntry(false);
    setSymbol(null);
    setManualTicker("");
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
    setManualEntry(false);
    setInstrumentId(inst.id);
    setInstrumentProvider(inst.provider ?? null);
    setSymbol(inst.symbol);
    setName(inst.displayName);
    if (inst.quoteCurrency) {
      setBuyCurrency(inst.quoteCurrency);
      setCurrentPriceCurrency(inst.quoteCurrency);
    }
    // Auto-priced → fetch a read-only price. Manual (non-US) → the user types it;
    // never call the price endpoint (it would 422 → spurious blocked banner).
    if (isAutoPriced(inst.provider)) {
      setCurrentPrice("");
      void fetchPrice(inst.id);
    } else {
      setCurrentPrice("");
      setPriceBlocked(false);
    }
  }

  /** "Enter manually": ticker not in the catalog. Keep what the user typed as the
   *  name, drop any instrument, make the price + currency user-editable. */
  function enableManualEntry() {
    markDirty();
    setManualEntry(true);
    setInstrumentId(null);
    setInstrumentProvider(null);
    setSymbol(null);
    setPriceBlocked(false);
    setCurrentPrice("");
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
    if (!uiType) return false; // no type chosen yet
    if (priceBlocked) return false;
    switch (behavior) {
      case "tracked":
        // Manual entry has no instrument — require a typed name + price instead.
        if (manualEntry) return !!name.trim() && !!currentPrice.trim();
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
      case "broker":
        // name + deposited (buyPrice) + actual (currentPrice); no quantity.
        return !!name.trim() && !!buyPrice.trim() && !!currentPrice.trim();
      case "manual":
      default:
        return !!name.trim() && !!currentPrice.trim();
    }
  }, [
    uiType,
    behavior,
    priceBlocked,
    instrumentId,
    manualEntry,
    currentPrice,
    buyPrice,
    name,
    quantity,
  ]);

  function attemptClose() {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function buildPayload() {
    // Only reached via handleSave after canSave, which guarantees uiType is set.
    const ut = uiType as UiType;
    const holdingType = UI_TYPE_META[ut].holdingType as HoldingType;
    const common = { uiType: ut, holdingType, group };
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
    if (behavior === "broker") {
      // Brokerage account: deposited (cost basis) vs actual (current value),
      // single currency, no quantity. P/L = actual − deposited.
      return {
        ...common,
        name: name.trim(),
        quantity: "1",
        buyPriceCents: toCents(buyPrice),
        buyCurrency,
        currentPriceCents: toCents(currentPrice),
        currentPriceCurrency: buyCurrency,
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
      const ticker = manualEntry ? manualTicker.trim() || null : null;
      return {
        ...common,
        name: name.trim(),
        instrumentId,
        manualTicker: ticker,
        // `symbol` is web-only (optimistic row ticker); the server derives it.
        symbol: manualEntry ? ticker : symbol,
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
        // pointer-events-auto: an open <Select> (Radix modal) locks body
        // pointer-events to none; the sheet's own overlay stays interactive and
        // would steal clicks meant for the Type trigger (re-click reopened the
        // dropdown instead of closing it). Forcing the content interactive keeps
        // the trigger clickable so it toggles closed normally.
        className="!pointer-events-auto flex w-full flex-col bg-[var(--canvas-dark)] sm:max-w-[480px]"
        // Close ONLY via the explicit X / Cancel / Discard buttons. The discard
        // AlertDialog portals OUTSIDE this content, so any click on it counts as
        // "interact outside"; letting that close the sheet re-ran attemptClose →
        // re-opened the discard dialog (Keep editing looked dead). Suppressing
        // outside-close unconditionally breaks that loop (no stale-state race).
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
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
              open={typeOpen}
              onOpenChange={onTypeOpenChange}
              onValueChange={(v) => changeType(v as UiType)}
            >
              <SelectTrigger
                aria-label={t("field.type")}
                data-testid="holding-sheet-type"
              >
                <SelectValue placeholder={t("field.typePlaceholder")}>
                  {uiType ? (
                    <span className="flex items-center gap-2">
                      {(() => {
                        const Icon = UI_TYPE_ICON[uiType];
                        return (
                          <Icon className="h-4 w-4 text-[var(--body-on-dark)]" />
                        );
                      })()}
                      <span>{t(`uitype.${uiType}`)}</span>
                    </span>
                  ) : null}
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

          {/* 2. Name / Asset — only once a Type is chosen (no field is focused on
              open: no type → no Asset/Name field, and neither input auto-focuses). */}
          {behavior === "tracked" && !manualEntry ? (
            <Field label={t("field.asset")}>
              <InstrumentSearchInput
                budgetId={budgetId}
                assetClass={meta?.assetClass}
                hideCustom
                allowManualEntry
                name={name}
                onNameChange={(v) => {
                  markDirty();
                  setName(v);
                  if (instrumentId != null) {
                    setInstrumentId(null);
                    setSymbol(null);
                  }
                }}
                onSelectInstrument={selectInstrument}
                onSelectCustom={enableManualEntry}
              />
            </Field>
          ) : behavior === "tracked" && manualEntry ? (
            // Manual entry (ticker not in the catalog): plain name + ticker fields.
            <>
              <Field label={t("field.name")}>
                <Input
                  data-testid="holding-sheet-name"
                  value={name}
                  onChange={(e) => {
                    markDirty();
                    setName(e.target.value);
                  }}
                />
              </Field>
              <Field label={t("field.ticker")}>
                <Input
                  data-testid="holding-sheet-ticker"
                  value={manualTicker}
                  onChange={(e) => {
                    markDirty();
                    setManualTicker(e.target.value.toUpperCase());
                  }}
                  placeholder={t("field.tickerPlaceholder")}
                />
              </Field>
            </>
          ) : behavior ? (
            <Field label={t("field.name")}>
              <Input
                data-testid="holding-sheet-name"
                value={name}
                onChange={(e) => {
                  markDirty();
                  setName(e.target.value);
                }}
              />
            </Field>
          ) : null}

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
          ) : behavior === "broker" ? (
            /* 4b. Broker: deposited value + currency + actual value (no quantity). */
            <>
              <Field label={t("field.depositedValue")}>
                <NumericInput
                  testId="holding-sheet-deposited"
                  value={buyPrice}
                  onChange={(v) => {
                    markDirty();
                    setBuyPrice(v);
                  }}
                />
              </Field>
              <Field label={t("field.currency")}>
                <CurrencyPicker
                  variant="field"
                  value={buyCurrency}
                  onSelect={(v) => {
                    markDirty();
                    setBuyCurrency(v);
                    setCurrentPriceCurrency(v);
                  }}
                  aria-label={t("field.currency")}
                />
              </Field>
              <Field label={t("field.actualValue")}>
                <NumericInput
                  testId="holding-sheet-actual"
                  value={currentPrice}
                  onChange={(v) => {
                    markDirty();
                    setCurrentPrice(v);
                  }}
                />
              </Field>
            </>
          ) : behavior ? (
            <>
              {/* 5. Buy price + currency + quantity (tracked / manual / metals).
                  Currency picker hides once an instrument is chosen (its quote
                  currency is used); the price labels then show that currency. */}
              <Field
                label={
                  showBuyCurrency
                    ? t("field.buyPrice")
                    : `${t("field.buyPrice")} (${buyCurrency})`
                }
              >
                <NumericInput
                  testId="holding-sheet-buy-price"
                  value={buyPrice}
                  onChange={(v) => {
                    markDirty();
                    setBuyPrice(v);
                  }}
                />
              </Field>
              {showBuyCurrency && (
                <Field
                  label={
                    behavior === "metals"
                      ? t("field.currency")
                      : t("field.buyCurrency")
                  }
                >
                  <CurrencyPicker
                    variant="field"
                    value={behavior === "metals" ? currentPriceCurrency : buyCurrency}
                    onSelect={(v) => {
                      markDirty();
                      setBuyCurrency(v);
                      // A manual value is a single currency: keep the current-price
                      // currency in lock-step so the saved value is unambiguous.
                      setCurrentPriceCurrency(v);
                      // Metals: re-fetch the spot converted into the new currency.
                      if (behavior === "metals") void resolveMetal(metal, v);
                    }}
                    aria-label={t("field.currency")}
                  />
                </Field>
              )}
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

              {/* 6. Current price — editable for manual types AND for tracked
                  instruments the user prices by hand (non-US instrument or manual
                  entry). The currency is shown in the label when it's fixed by a
                  chosen instrument (no picker above). */}
              <Field
                label={
                  showBuyCurrency
                    ? t("field.currentPrice")
                    : `${t("field.currentPrice")} (${currentPriceCurrency})`
                }
              >
                {behavior === "manual" || trackedManual ? (
                  <NumericInput
                    testId="holding-sheet-amount"
                    value={currentPrice}
                    onChange={(v) => {
                      markDirty();
                      setCurrentPrice(v);
                    }}
                    placeholder={buyPrice}
                  />
                ) : priceBlocked ? (
                  // Price-fetch failure shown AT the price field so it reads as
                  // price-related (not a generic top-of-form error).
                  <PriceBlockedBanner
                    onRetry={() => {
                      if (behavior === "metals") void resolveMetal(metal);
                      else if (instrumentId) void fetchPrice(instrumentId);
                    }}
                    retrying={retrying}
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
          ) : null}

          {/* 7. Group (every type) — only once a Type is chosen, so the open
              form is just the Type picker until then. */}
          {behavior && (
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
  // Same close-then-reopen guard as the Type dropdown: on touch, Radix closes the
  // open list on the trigger tap (pointer-down-outside) and the trigger then
  // reopens it in the same gesture → it never closes. Suppress any "open" that
  // fires right after a "close" so a trigger tap reliably toggles it shut.
  const [open, setOpen] = useState(false);
  const reopenBlockUntil = useRef(0);
  const onOpenChange = (next: boolean) => {
    const now = Date.now();
    if (next && now < reopenBlockUntil.current) return;
    if (!next) reopenBlockUntil.current = now + 300;
    setOpen(next);
  };
  return (
    <Select
      value={value}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={onChange}
    >
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
