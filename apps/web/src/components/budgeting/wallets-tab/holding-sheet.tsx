"use client";
/**
 * holding-sheet.tsx — Type-first ADD sheet (Phase 9.1; 13.1 Add-only).
 *
 * 13.1: editing an asset is EditAssetSheet (label / display currency / hand
 * value) and buying more is the Swap sheet; this sheet only adds. The Name is
 * an autocomplete over the type's assets — the same name joins that asset
 * (D-02). `holding` only pre-fills the form.
 *
 * The FIRST field is Type; the chosen UI type drives which fields render and how
 * the holding is priced (see lib/investment-types.ts):
 *   tracked (stocks/crypto) — Asset autocomplete (filtered to the
 *     type) + buy price/ccy + quantity + read-only fetched current price.
 *   manual (treasury_bond/collectibles/real_estate/other) — name + buy price/ccy +
 *     quantity + editable current price.
 *   precious_metals — name + metal + kind + UoM + quantity + buy price/ccy +
 *     fetched-and-converted read-only current price (spot/oz → UoM).
 *   cash — name + currency + amount.
 * shadcn <Sheet side="right"> (controlled, no
 * trigger). Optimistic save via the create/update hooks; discard-confirm on dirty.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  AssetNameCombobox,
  keepSheetOnListEscape,
} from "./asset-name-combobox";
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
  CAP_FREQUENCIES,
  type UiType,
  type Metal,
  type MetalKind,
  type Uom,
  type CapFrequency,
} from "@/lib/investment-types";
import {
  computeHoldingPreview,
  type HoldingPreview,
} from "@/lib/holding-preview";
import { PriceBlockedBanner } from "./price-blocked-banner";
import { SwapBuyTab } from "./swap-buy-tab";
import { today as todayIso } from "./swap-shared";
import { useMinEntryDate } from "@/hooks/use-asset-entries";
import { useInvestments } from "@/hooks/use-investments";
import {
  InstrumentSearchInput,
  type InstrumentSuggestion,
} from "./instrument-search-input";

interface HoldingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  budgetCurrency: string;
  /** Pre-fill the form from an existing holding's fields. */
  holding?: HoldingDto | null;
  /** Phase 13 Sell → "New investment": render ONLY the type + type fields (no
   *  sheet shell, amounts, preview or actions). The amount is what was
   *  received, so price/amount/currency inputs hide; quantity types ask for
   *  "Quantity bought". Emits the new holding (or null while incomplete). */
  destination?: {
    receivedCurrency: string;
    initialUiType?: UiType;
    onChange: (h: DestinationHolding | null) => void;
  };
  /** Add mode: start with this type chosen. */
  initialUiType?: UiType;
}

/** The "new" destination of a sale, as POST /:id/sell expects it. */
export interface DestinationHolding {
  name: string;
  holdingType: HoldingType;
  uiType: UiType;
  instrumentId?: string | null;
  manualTicker?: string | null;
  metal?: Metal;
  metalKind?: MetalKind;
  unitOfMeasure?: Uom;
  quantity?: string;
  currentPriceCurrency: string;
}

/** Decimal string → cents string (sub-cent kept to 6 places), or null. The
 *  current price is stored to 6 places so a total split over several units
 *  survives a re-save; integer columns round on the server. */
function toCents(value: string): string | null {
  const n = Number(value.replace(/\s/g, "").replace(/,/g, ".").trim());
  if (!value.trim() || !Number.isFinite(n)) return null;
  return String(Number((n * 100).toFixed(6)));
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
  budgetId,
  budgetCurrency,
  holding,
  destination: dest,
  initialUiType,
}: HoldingSheetProps) {
  const t = useTranslations("budget.investments");
  const fmt = useFormatter();
  const createMut = useCreateHolding(budgetId);
  // 13.1 UAT 7: picking an existing asset from the Name list turns Add into
  // that asset's locked Buy form (Swap → Buy, D-08). Not in the sale's
  // destination mode — there the label joins on the server.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const holdingsList = useInvestments(budgetId).data;
  const picked =
    (pickedId && holdingsList?.find((h) => h.id === pickedId)) || null;

  // Starts with NO type chosen ("") so nothing is preselected; a pre-fill
  // derives the holding's type.
  const [uiType, setUiType] = useState<UiType | "">(
    holding
      ? deriveUiType(holding.uiType, holding.holdingType, holding.isCustom)
      : (dest?.initialUiType ?? initialUiType ?? ""),
  );
  // For a tracked (auto-fetch) holding, `name` drives the Asset search box and
  // holds the INSTRUMENT label; the optional user override lives in `customName`.
  // Everything else keeps `name` as the holding's own name.
  const [name, setName] = useState(() => {
    if (!holding) return "";
    const ut = deriveUiType(
      holding.uiType,
      holding.holdingType,
      holding.isCustom,
    );
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
    const ut = deriveUiType(
      holding.uiType,
      holding.holdingType,
      holding.isCustom,
    );
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
  // Stocks & ETFs is one type (D-10); the coarse holding_type (price routing)
  // follows the picked instrument's asset class (RESEARCH A6).
  const [instrumentAssetClass, setInstrumentAssetClass] = useState<
    string | null
  >(holding?.holdingType === "etf" ? "etf" : null);
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
  // Deposit: principal rides `buyPrice`/`buyCurrency`; these describe accrual.
  const [depositRate, setDepositRate] = useState(
    holding?.depositRateBps != null ? String(holding.depositRateBps / 100) : "",
  );
  const [depositStart, setDepositStart] = useState(
    holding?.depositStartDate ?? new Date().toISOString().slice(0, 10),
  );
  const [depositEnd, setDepositEnd] = useState(holding?.depositEndDate ?? "");
  const [depositFreq, setDepositFreq] = useState<CapFrequency>(
    (holding?.depositCapFrequency as CapFrequency) ?? "monthly",
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
  // Create auto-opens the Type list — but never as an embedded sale destination
  // (a modal list there swallows input meant for the Sell sheet).
  const [typeOpen, setTypeOpen] = useState(!dest && !holding);
  const reopenBlockUntil = useRef(0);
  const onTypeOpenChange = (next: boolean) => {
    const now = Date.now();
    if (next && now < reopenBlockUntil.current) return;
    if (!next) reopenBlockUntil.current = now + 300;
    setTypeOpen(next);
  };

  const meta = uiType ? UI_TYPE_META[uiType] : null;
  const behavior = meta?.behavior ?? null;
  // Sell → New investment: priced-per-unit types ask how many units were bought.
  const destQuantity = behavior === "tracked" || behavior === "metals";

  const today = new Date().toLocaleDateString("en-CA");
  const [openedOn, setOpenedOn] = useState(today);
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
    if (UI_TYPE_META[next].behavior === "deposit") {
      setDepositRate("");
      setDepositStart(new Date().toISOString().slice(0, 10));
      setDepositEnd("");
      setDepositFreq("monthly");
    }
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
    setInstrumentAssetClass(inst.assetClass ?? null);
    setSymbol(inst.symbol);
    setName(inst.displayName);
    // Default the holding's currency on select:
    //   crypto → DON'T adopt the instrument's quote ccy; keep the user's pick
    //     (default = budget currency) and FX-convert the USD quote into it.
    //   equity/ETF/everything else → adopt the instrument's OWN quote currency (the
    //     asset's native ccy, e.g. USD) as the default. equity/ETF still show the
    //     picker (usesUserChosenCurrency) so the user can re-denominate afterward.
    const adoptInstrumentCcy = uiType !== "crypto";
    // Compute the fetch target explicitly — setBuyCurrency below is async, so
    // reading `buyCurrency` state here would be stale.
    const holdingCcy =
      adoptInstrumentCcy && inst.quoteCurrency
        ? inst.quoteCurrency
        : buyCurrency;
    if (adoptInstrumentCcy && inst.quoteCurrency) {
      setBuyCurrency(inst.quoteCurrency);
      setCurrentPriceCurrency(inst.quoteCurrency);
    }
    // Auto-priced → fetch a read-only price. Manual (non-US) → the user types it;
    // never call the price endpoint (it would 422 → spurious blocked banner).
    if (isAutoPriced(inst.provider)) {
      setCurrentPrice("");
      // User-currency types (crypto/equity/etf): ask for the price in the holding's
      // currency — the server FX-converts when it differs from the provider quote
      // (equity default = asset ccy → no conversion; a later currency change does).
      void fetchPrice(inst.id, userChosenCurrency ? holdingCcy : undefined);
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
        currency: behavior === "deposit" ? buyCurrency : currentPriceCurrency,
        quantity,
        buyPrice,
        currentPrice,
        uom,
        premiumPct,
        depositRatePct: depositRate,
        depositStart,
        depositEnd,
        depositFreq,
      }),
    [
      behavior,
      currentPriceCurrency,
      buyCurrency,
      quantity,
      buyPrice,
      currentPrice,
      uom,
      premiumPct,
      depositRate,
      depositStart,
      depositEnd,
      depositFreq,
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
      case "deposit":
        // name + principal (buyPrice) + rate + start date; end date optional.
        return (
          !!name.trim() &&
          !!buyPrice.trim() &&
          !!depositRate.trim() &&
          !!depositStart.trim()
        );
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
    depositRate,
    depositStart,
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
    const holdingType = (
      ut === "stocks" && instrumentAssetClass === "etf"
        ? "etf"
        : UI_TYPE_META[ut].holdingType
    ) as HoldingType;
    const common = { uiType: ut, holdingType };
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
    if (behavior === "deposit") {
      // Bank deposit: principal is the cost basis; the current value is computed
      // server-side from rate+start+cadence, so seed current = principal for the
      // optimistic row. Rate stored as basis points (percent × 100).
      const principal = toCents(buyPrice);
      const bps = depositRate.trim()
        ? Math.round(Number(depositRate.replace(",", ".")) * 100)
        : null;
      return {
        ...common,
        name: name.trim(),
        quantity: "1",
        buyPriceCents: principal,
        buyCurrency,
        currentPriceCents: principal,
        currentPriceCurrency: buyCurrency,
        depositRateBps: bps,
        depositStartDate: depositStart || null,
        depositEndDate: depositEnd || null,
        depositCapFrequency: depositFreq,
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
    createMut.mutate({ ...buildPayload(), openedOn } as unknown as Parameters<
      typeof createMut.mutate
    >[0]);
    onOpenChange(false);
  }

  const destOnChange = dest?.onChange;
  const destCcy = dest?.receivedCurrency;
  useEffect(() => {
    if (!destOnChange || !destCcy) return;
    const ut = uiType;
    const label = (customName.trim() || name.trim()).trim();
    const qtyOk = !destQuantity || Number(quantity.replace(",", ".")) > 0;
    const instrumentOk =
      behavior === "metals" || (behavior === "tracked" && !manualEntry)
        ? instrumentId != null
        : true;
    if (!ut || !label || !qtyOk || !instrumentOk) {
      destOnChange(null);
      return;
    }
    destOnChange({
      name: label,
      uiType: ut,
      holdingType: (ut === "stocks" && instrumentAssetClass === "etf"
        ? "etf"
        : UI_TYPE_META[ut].holdingType) as HoldingType,
      instrumentId,
      manualTicker: manualEntry ? manualTicker.trim() || null : null,
      ...(behavior === "metals"
        ? { metal, metalKind, unitOfMeasure: uom }
        : {}),
      ...(destQuantity ? { quantity: quantity.replace(",", ".") } : {}),
      currentPriceCurrency: destCcy,
    });
  }, [
    destOnChange,
    destCcy,
    uiType,
    name,
    customName,
    quantity,
    destQuantity,
    behavior,
    manualEntry,
    manualTicker,
    instrumentId,
    instrumentAssetClass,
    metal,
    metalKind,
    uom,
  ]);

  // D-02: the same name in the type joins that asset (hidden ones reopen).
  // Tracked types: the name is the asset's label (customName) and, until an
  // instrument is chosen, also seeds the instrument search (13.1 UAT 7).
  const tracked = behavior === "tracked";
  const nameField = (
    <AssetNameCombobox
      budgetId={budgetId}
      uiType={uiType || null}
      value={tracked ? customName : name}
      testId="holding-sheet-name"
      ariaLabel={t("field.name")}
      onChange={(v) => {
        markDirty();
        setPickedId(null);
        if (!tracked) return setName(v);
        setCustomName(v);
        if (instrumentId == null && !manualEntry) setName(v);
      }}
      onPickExisting={(a) => !dest && setPickedId(a.id)}
    />
  );

  // The type + type-specific fields — shared by the sheet and the Sell
  // "New investment" destination (one source of truth for type fields).
  const typeField = (
    <>
      {/* 1. Type — always first; drives the rest of the form. */}
      <Field label={t("field.type")}>
        <Select
          value={uiType}
          open={typeOpen}
          onOpenChange={onTypeOpenChange}
          onValueChange={(v) => changeType(v as UiType)}
          disabled={!!picked}
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
          {/* Grow to the available viewport height (12 types) instead of the
                  shared 384px cap — scrolls only when the screen is truly short. */}
          <SelectContent className="max-h-[var(--radix-select-content-available-height)]">
            {UI_TYPE_ORDER.filter(
              // A sale cannot open a deposit (it accrues from a principal).
              (tp) => !dest || tp !== "deposit",
            ).map((tp) => {
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
    </>
  );

  const formFields = (
    <>
      {typeField}
      {/* 2. Name, then (tracked) the instrument — only once a Type is chosen
              (no type → no field, and nothing auto-focuses). */}
      {behavior === "tracked" && !manualEntry ? (
        <>
          <Field label={t("field.name")}>{nameField}</Field>
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
        </>
      ) : behavior === "tracked" && manualEntry ? (
        // Manual entry (ticker not in the catalog): plain name + ticker fields.
        <>
          <Field label={t("field.name")}>{nameField}</Field>
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
        <Field label={t("field.name")}>{nameField}</Field>
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
      {dest &&
      (behavior === "cash" || behavior === "broker") ? null : behavior ===
        "cash" ? (
        <>
          <Field label={t("field.currency")}>
            <CurrencyPicker
              variant="field"
              richLabel
              desktopDropdown
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
        /* 4b. Broker / Savings: two amounts + currency, no quantity. Savings
                   relabels them Starting / Current (same field-set). */
        <>
          <Field
            label={t(
              uiType === "savings"
                ? "field.startingAmount"
                : "field.depositedValue",
            )}
          >
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
              richLabel
              desktopDropdown
              value={buyCurrency}
              onSelect={(v) => {
                markDirty();
                setBuyCurrency(v);
                setCurrentPriceCurrency(v);
              }}
              aria-label={t("field.currency")}
            />
          </Field>
          <Field
            label={t(
              uiType === "savings"
                ? "field.currentAmount"
                : "field.actualValue",
            )}
          >
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
      ) : behavior === "deposit" ? (
        /* 4c. Deposit: currency + principal + annual rate + capitalization
               frequency + start date + optional maturity. Value accrues on read. */
        <>
          <Field label={t("field.currency")}>
            <CurrencyPicker
              variant="field"
              richLabel
              desktopDropdown
              value={buyCurrency}
              onSelect={(v) => {
                markDirty();
                setBuyCurrency(v);
                setCurrentPriceCurrency(v);
              }}
              aria-label={t("field.currency")}
            />
          </Field>
          <Field label={t("field.principal")}>
            <NumericInput
              testId="holding-sheet-principal"
              value={buyPrice}
              onChange={(v) => {
                markDirty();
                setBuyPrice(v);
              }}
            />
          </Field>
          <Field label={t("field.rate")}>
            <NumericInput
              testId="holding-sheet-rate"
              value={depositRate}
              onChange={(v) => {
                markDirty();
                setDepositRate(v);
              }}
              placeholder="0"
            />
          </Field>
          <Field label={t("field.capFrequency")}>
            <Select
              value={depositFreq}
              onValueChange={(v) => {
                markDirty();
                setDepositFreq(v as CapFrequency);
              }}
            >
              <SelectTrigger
                aria-label={t("field.capFrequency")}
                data-testid="holding-sheet-cap-frequency"
              >
                <SelectValue>{t(`capFrequency.${depositFreq}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CAP_FREQUENCIES.map((f) => (
                  <SelectItem
                    key={f}
                    value={f}
                    data-testid={`cap-frequency-${f}`}
                  >
                    {t(`capFrequency.${f}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("field.startDate")}>
            <Input
              type="date"
              data-testid="holding-sheet-start-date"
              value={depositStart}
              onChange={(e) => {
                markDirty();
                setDepositStart(e.target.value);
              }}
            />
          </Field>
          <Field label={t("field.endDateOptional")}>
            <Input
              type="date"
              data-testid="holding-sheet-end-date"
              value={depositEnd}
              min={depositStart || undefined}
              onChange={(e) => {
                markDirty();
                setDepositEnd(e.target.value);
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
          {showBuyCurrency && !dest && (
            <Field
              label={
                behavior === "metals" || userChosenCurrency
                  ? t("field.currency")
                  : t("field.buyCurrency")
              }
            >
              <CurrencyPicker
                variant="field"
                richLabel
                desktopDropdown
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
          {!dest && (
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
          )}
          {(!dest || destQuantity) && (
            <Field label={dest ? t("sell.qtyBought") : t("field.quantity")}>
              <NumericInput
                testId="holding-sheet-quantity"
                value={quantity}
                onChange={(v) => {
                  markDirty();
                  setQuantity(v);
                }}
              />
            </Field>
          )}

          {!dest && (
            <>
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
                  // No placeholder: seeding it from buyPrice made an EMPTY current
                  // price look already filled (user couldn't tell it was blank).
                  <NumericInput
                    testId="holding-sheet-amount"
                    value={currentPrice}
                    onChange={(v) => {
                      markDirty();
                      setCurrentPrice(v);
                    }}
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
          )}
        </>
      ) : null}
    </>
  );

  if (dest)
    return (
      <div data-testid="holding-form-destination" className="space-y-4">
        {formFields}
      </div>
    );

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
        className="!pointer-events-auto flex w-full flex-col overflow-y-auto bg-[var(--canvas-dark)] sm:max-w-[480px]"
        // Close ONLY via the explicit X / Cancel / Discard buttons. The discard
        // AlertDialog portals OUTSIDE this content, so any click on it counts as
        // "interact outside"; letting that close the sheet re-ran attemptClose →
        // re-opened the discard dialog (Keep editing looked dead). Suppressing
        // outside-close unconditionally breaks that loop (no stale-state race).
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={keepSheetOnListEscape}
      >
        <SheetHeader className="mb-2">
          <SheetTitle className="text-[var(--body-on-dark)]">
            {t("sheet.title.add")}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-1 pb-4">
          {picked ? (
            <>
              {typeField}
              <Field label={t("field.name")}>{nameField}</Field>
              <PickedBuy
                budgetId={budgetId}
                budgetCurrency={budgetCurrency}
                holding={picked}
                holdings={holdingsList ?? []}
                onDone={() => onOpenChange(false)}
              />
            </>
          ) : (
            <>
              {formFields}

              {/* 8. Preview — "what will be created" sum-up (all types). */}
              {preview && (
                <HoldingPreviewBlock
                  preview={preview}
                  behavior={behavior}
                  uiType={uiType}
                />
              )}

              {
                <Field label={t("addDate")}>
                  <Input
                    type="date"
                    data-testid="holding-sheet-date"
                    value={openedOn}
                    max={today}
                    onChange={(e) => setOpenedOn(e.target.value)}
                  />
                </Field>
              }

              {/* Actions live at the END of the scrolling form (NOT a pinned footer):
              the user scrolls down to reach Save. */}
              <div
                data-testid="holding-sheet-actions"
                className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--hairline-dark)] pt-4"
              >
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
            </>
          )}
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
  uiType,
}: {
  preview: HoldingPreview;
  behavior: string | null;
  uiType: UiType | "" | null;
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
        label: t(
          uiType === "savings" ? "preview.starting" : "preview.deposited",
        ),
        value: money(preview.buyTotal),
      });
    rows.push({
      key: "cur",
      label: t("preview.currentValue"),
      value: money(preview.actualTotal),
    });
  } else if (behavior === "deposit") {
    if (preview.buyTotal != null)
      rows.push({
        key: "principal",
        label: t("preview.principal"),
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

export function Field({
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

export function NumericInput({
  value,
  onChange,
  testId,
  placeholder,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      data-testid={testId}
      value={value}
      readOnly={readOnly}
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

/** Sell → "New investment": the Add form's type + fields, nothing else. */
export function HoldingFormFields(props: {
  budgetId: string;
  budgetCurrency: string;
  receivedCurrency: string;
  initialUiType?: UiType;
  onChange: (h: DestinationHolding | null) => void;
}) {
  return (
    <HoldingSheet
      open
      onOpenChange={() => {}}
      budgetId={props.budgetId}
      budgetCurrency={props.budgetCurrency}
      destination={{
        receivedCurrency: props.receivedCurrency,
        initialUiType: props.initialUiType,
        onChange: props.onChange,
      }}
    />
  );
}

/** Add → an existing asset: its Buy form with type/name/instrument locked. */
function PickedBuy({
  budgetId,
  budgetCurrency,
  holding,
  holdings,
  onDone,
}: {
  budgetId: string;
  budgetCurrency: string;
  holding: HoldingDto;
  holdings: HoldingDto[];
  onDone: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const minDate = useMinEntryDate(budgetId, holding.id);
  return (
    <SwapBuyTab
      budgetId={budgetId}
      budgetCurrency={budgetCurrency}
      holding={holding}
      holdings={holdings}
      date={date}
      setDate={setDate}
      minDate={minDate}
      onDone={onDone}
    />
  );
}
