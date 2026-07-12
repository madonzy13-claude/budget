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
import { useTranslations, useLocale, useFormatter } from "next-intl";
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
import { centsToBare } from "@/lib/cents-format";
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
  usesUserChosenCurrency,
  type UiType,
  type Metal,
  type MetalKind,
  type Uom,
} from "@/lib/investment-types";
import {
  computeHoldingPreview,
  type HoldingPreview,
} from "@/lib/holding-preview";
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
/** Drop trailing zeros from a numeric(28,8) string: "1.13000000" → "1.13",
 *  "1.00000000" → "1". Leaves a non-decimal string untouched. */
function trimQty(q: string): string {
  return q.includes(".") ? q.replace(/0+$/, "").replace(/\.$/, "") : q;
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
  const fmt = useFormatter();
  const createMut = useCreateHolding(budgetId);
  const updateMut = useUpdateHolding(budgetId);

  // Create mode starts with NO type chosen ("") so nothing is preselected; edit
  // mode derives the existing holding's type.
  const [uiType, setUiType] = useState<UiType | "">(
    holding
      ? deriveUiType(holding.uiType, holding.holdingType, holding.isCustom)
      : "",
  );
  // For a tracked (auto-fetch) holding, `name` drives the Asset search box and
  // holds the INSTRUMENT label; the optional user override lives in `customName`.
  // Everything else keeps `name` as the holding's own name.
  const [name, setName] = useState(() => {
    if (!holding) return "";
    const ut = deriveUiType(holding.uiType, holding.holdingType, holding.isCustom);
    const autoTracked =
      holding.instrumentId != null && UI_TYPE_META[ut].behavior === "tracked";
    return autoTracked && holding.instrumentName
      ? holding.instrumentName
      : holding.name;
  });
  // Optional custom name for auto-fetch assets (crypto/equity/etf). When set it
  // becomes the saved `name` (and the row renders it instead of "TICKER (Name)").
  const [customName, setCustomName] = useState(() => {
    if (!holding || holding.instrumentId == null) return "";
    const ut = deriveUiType(holding.uiType, holding.holdingType, holding.isCustom);
    if (UI_TYPE_META[ut].behavior !== "tracked") return "";
    return holding.instrumentName &&
      holding.name.trim() !== holding.instrumentName.trim()
      ? holding.name
      : "";
  });
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
  const [quantity, setQuantity] = useState(trimQty(holding?.quantity ?? "1"));
  const [currentPrice, setCurrentPrice] = useState(
    centsToDecimal(holding?.currentPriceCents ?? null),
  );
  const [currentPriceCurrency, setCurrentPriceCurrency] = useState(
    holding?.currentPriceCurrency ?? budgetCurrency,
  );
  // ISO time the shown auto-price was fetched (hourly cache), for the "last
  // updated" age. Seeded from the holding on open; refreshed on each on-demand
  // fetch below. null → no known time (renders "just now").
  const [priceFetchedAt, setPriceFetchedAt] = useState<string | null>(
    holding?.priceFetchedAt ?? null,
  );
  const [group, setGroup] = useState<string | null>(holding?.group ?? null);
  const [metal, setMetal] = useState<Metal>(
    (holding?.metal as Metal) ?? "gold",
  );
  const [metalKind, setMetalKind] = useState<MetalKind>(
    (holding?.metalKind as MetalKind) ?? "coin",
  );
  const [uom, setUom] = useState<Uom>((holding?.unitOfMeasure as Uom) ?? "g");
  // Bullion premium over spot (percent string), metals only. Applied to the
  // current (resale) value; empty = melt/spot value. Kept as a string so the
  // field can hold a transient empty/decimal state.
  const [premiumPct, setPremiumPct] = useState<string>(
    trimQty(holding?.premiumPct ?? ""),
  );
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
  // broker / manual-entry tracked with no instrument). Two exceptions value an
  // upstream-USD quote in a user-chosen currency, so they KEEP the picker even
  // with an instrument: metals (spot/oz) and crypto (CoinGecko USD) — the fetched
  // price is FX-converted to the chosen currency.
  const userChosenCurrency = usesUserChosenCurrency(uiType);
  const showBuyCurrency =
    instrumentId == null || behavior === "metals" || userChosenCurrency;
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
          body: JSON.stringify(
            targetCurrency ? { currency: targetCurrency } : {},
          ),
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
        fetchedAt?: string;
      };
      const cents =
        json.priceCents != null
          ? String(json.priceCents)
          : json.price != null
            ? toCents(String(json.price))
            : null;
      if (cents != null) setCurrentPrice(centsToDecimal(cents));
      if (json.currency) setCurrentPriceCurrency(json.currency);
      if (json.fetchedAt) setPriceFetchedAt(json.fetchedAt);
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
    setCustomName("");
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
    // Crypto values its USD quote in the user's chosen currency, so DON'T lock to
    // the instrument's quote currency — keep what the user picked (default = budget
    // currency) and fetch the price converted into it (below). Everything else
    // adopts the instrument's quote currency.
    if (inst.quoteCurrency && !userChosenCurrency) {
      setBuyCurrency(inst.quoteCurrency);
      setCurrentPriceCurrency(inst.quoteCurrency);
    }
    // Auto-priced → fetch a read-only price. Manual (non-US) → the user types it;
    // never call the price endpoint (it would 422 → spurious blocked banner).
    if (isAutoPriced(inst.provider)) {
      setCurrentPrice("");
      // Crypto: ask for the price FX-converted into the chosen currency.
      void fetchPrice(inst.id, userChosenCurrency ? buyCurrency : undefined);
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

  // Read-only current-price preview (metals: spot/oz converted to the UoM). This is
  // the RAW market price per unit — the bullion premium is shown + applied below in
  // the Preview sum-up, not folded into this field.
  const currentPricePreview = useMemo(() => {
    if (!currentPrice) return "";
    if (behavior === "metals") {
      const perUnit = Number(currentPrice) * OZ_PER_UNIT[uom];
      return Number.isFinite(perUnit) ? perUnit.toFixed(2) : "";
    }
    return currentPrice;
  }, [currentPrice, behavior, uom]);

  // "Last updated" age for the auto-fetched price. < 1 min reads "just now"
  // (avoids a jittery "12 seconds ago"); older uses next-intl relative time
  // ("15 minutes ago"). Prices refresh on the hourly cron, so this is usually
  // minutes/up to an hour — NOT always "just now" (the previous hardcoded value).
  const priceRelative = useMemo(() => {
    if (!priceFetchedAt) return t("field.now");
    const at = new Date(priceFetchedAt);
    if (Number.isNaN(at.getTime())) return t("field.now");
    return Date.now() - at.getTime() < 60_000
      ? t("field.now")
      : fmt.relativeTime(at);
  }, [priceFetchedAt, fmt, t]);

  // Live "what will be created" sum-up (all types) — buy/current totals, premium,
  // P/L. buy + current currency are kept lock-step in this form, so it is single-
  // currency and the P/L is exact (no FX in the preview).
  const preview = useMemo(
    () =>
      computeHoldingPreview({
        behavior,
        currency: currentPriceCurrency,
        quantity,
        buyPrice,
        currentPrice,
        uom,
        premiumPct,
      }),
    [
      behavior,
      currentPriceCurrency,
      quantity,
      buyPrice,
      currentPrice,
      uom,
      premiumPct,
    ],
  );

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
        // Premium over spot (resale value). Empty → null (melt/spot value).
        premiumPct: premiumPct.trim() ? premiumPct.replace(",", ".") : null,
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
        // Auto-fetch asset: the optional custom name wins over the instrument
        // label; manual entry has no custom-name field so this is just `name`.
        name: customName.trim() || name.trim(),
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
            <>
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
              {/* Optional custom name for the auto-fetch asset — when set it's shown
                  in the list instead of the auto "TICKER (Name)" label. */}
              {instrumentId != null && (
                <Field label={t("field.nameOptional")}>
                  <Input
                    data-testid="holding-sheet-custom-name"
                    value={customName}
                    placeholder={name}
                    onChange={(e) => {
                      markDirty();
                      setCustomName(e.target.value);
                    }}
                  />
                </Field>
              )}
            </>
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
              {/* 5. Currency + buy price + quantity (tracked / manual / metals).
                  Currency comes FIRST (before buy price) so the user picks the
                  denomination before typing an amount. The picker hides once an
                  instrument is chosen (its quote currency is used); the price
                  labels then show that currency. */}
              {showBuyCurrency && (
                <Field
                  label={
                    behavior === "metals" || userChosenCurrency
                      ? t("field.currency")
                      : t("field.buyCurrency")
                  }
                >
                  <CurrencyPicker
                    variant="field"
                    value={
                      behavior === "metals" || userChosenCurrency
                        ? currentPriceCurrency
                        : buyCurrency
                    }
                    onSelect={(v) => {
                      markDirty();
                      setBuyCurrency(v);
                      // A manual value is a single currency: keep the current-price
                      // currency in lock-step so the saved value is unambiguous.
                      setCurrentPriceCurrency(v);
                      // Metals: re-fetch the spot converted into the new currency.
                      if (behavior === "metals") void resolveMetal(metal, v);
                      // Crypto: re-fetch the instrument's USD quote converted to it.
                      else if (userChosenCurrency && instrumentId != null)
                        void fetchPrice(instrumentId, v);
                    }}
                    aria-label={t("field.currency")}
                  />
                </Field>
              )}
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
                    {/* Auto-fetched price: a real (disabled) field, not editable. */}
                    <Input
                      data-testid="holding-sheet-current-price"
                      disabled
                      readOnly
                      // Currency is conveyed by the field label (tracked) / the
                      // currency picker (metals / crypto) + the Preview — so the
                      // value itself is just the number.
                      value={currentPricePreview || "—"}
                      className="text-num-md tabular-nums"
                    />
                    {/* When the price was fetched. */}
                    <p className="text-caption text-[var(--muted-foreground)]">
                      {t("field.lastUpdated", { relativeTime: priceRelative })}
                    </p>
                  </div>
                )}
              </Field>
              {/* Bullion premium — metals only, BELOW the (raw) current price; the
                  Preview sum-up applies it to the resale value. */}
              {behavior === "metals" && (
                <Field label={t("field.premium")}>
                  <NumericInput
                    testId="holding-sheet-premium"
                    value={premiumPct}
                    onChange={(v) => {
                      markDirty();
                      setPremiumPct(v);
                    }}
                    placeholder="0"
                  />
                </Field>
              )}
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

          {/* 8. Preview — "what will be created" sum-up (all types). */}
          {preview && (
            <HoldingPreviewBlock preview={preview} behavior={behavior} />
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

/** "What will be created" sum-up. Type-aware rows: buy total, current value,
 *  (metals: + premium = with-premium), and P/L. Single-currency (the form keeps
 *  buy + current currency in lock-step). */
function HoldingPreviewBlock({
  preview,
  behavior,
}: {
  preview: HoldingPreview;
  behavior: string | null;
}) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  // Same number rule as the rest of the app (centsToBare): whole → no decimals,
  // fractional → exactly 2 (100 → "100", 100.5 → "100.50", 100.34 → "100.34").
  const fmt = (n: number) => centsToBare(String(Math.round(n * 100)), locale);
  const money = (n: number) => `${fmt(n)} ${preview.currency}`;
  const trim = (n: number) => {
    const s = String(n);
    return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  };
  const qtyStr = preview.showQty ? ` × ${trim(preview.qty)}` : "";

  type Row = {
    key: string;
    label: string;
    sub?: string;
    value: string;
    pl?: boolean;
  };
  const rows: Row[] = [];
  if (behavior === "cash") {
    rows.push({
      key: "amount",
      label: t("preview.amount"),
      value: money(preview.actualTotal),
    });
  } else if (behavior === "broker") {
    if (preview.buyTotal != null)
      rows.push({
        key: "dep",
        label: t("preview.deposited"),
        value: money(preview.buyTotal),
      });
    rows.push({
      key: "cur",
      label: t("preview.currentValue"),
      value: money(preview.actualTotal),
    });
  } else {
    if (preview.buyTotal != null)
      rows.push({
        key: "buy",
        label: t("preview.buyTotal"),
        sub: `${fmt(preview.buyUnit ?? 0)}${qtyStr}`,
        value: money(preview.buyTotal),
      });
    rows.push({
      key: "cur",
      label: t("preview.currentValue"),
      sub: `${fmt(preview.actualUnit)}${qtyStr}`,
      value: money(preview.actualBase),
    });
    if (preview.premiumPct > 0) {
      rows.push({
        key: "prem",
        label: t("preview.premium"),
        sub: `${trim(preview.premiumPct)}%`,
        value: `+ ${money(preview.premiumAmount)}`,
      });
      rows.push({
        key: "withprem",
        label: t("preview.withPremium"),
        value: money(preview.actualTotal),
      });
    }
  }
  if (preview.pl != null) {
    const sign = preview.pl > 0 ? "+" : preview.pl < 0 ? "−" : "";
    const pct =
      preview.plPct != null
        ? ` (${preview.plPct >= 0 ? "+" : "−"}${Math.abs(preview.plPct).toFixed(1)}%)`
        : "";
    rows.push({
      key: "pl",
      label: t("preview.pl"),
      value: `${sign}${money(Math.abs(preview.pl))}${pct}`,
      pl: true,
    });
  }

  const plColor =
    preview.pl != null && preview.pl < 0
      ? "text-[var(--trading-down)]"
      : preview.pl != null && preview.pl > 0
        ? "text-[var(--trading-up)]"
        : "text-[var(--body-on-dark)]";

  return (
    <div
      data-testid="holding-sheet-preview"
      className="mt-2 rounded-[var(--radius-md)] border border-[var(--input)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)] p-3"
    >
      <p className="mb-3 border-b border-[var(--hairline-dark)] pb-2 text-caption font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        {t("preview.title")}
      </p>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div
            key={r.key}
            className={[
              // label + its formula stack on the LEFT (so the formula never
              // competes with the amount → no wrap); the amount stays on one line.
              "flex items-center justify-between gap-4",
              // Separate the concluding P/L row with a divider.
              r.pl ? "mt-1 border-t border-[var(--hairline-dark)] pt-2.5" : "",
            ].join(" ")}
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-body-sm text-[var(--muted-foreground)]">
                {r.label}
              </span>
              {r.sub && (
                <span className="text-caption tabular-nums text-[var(--muted-strong)]">
                  {r.sub}
                </span>
              )}
            </span>
            <span
              className={[
                "shrink-0 whitespace-nowrap text-num-sm font-medium tabular-nums",
                r.pl ? plColor : "text-[var(--body-on-dark)]",
              ].join(" ")}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
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
