/**
 * investment-types.ts — Phase 9.1 type-first form config (web mirror of the
 * server contract's UI_TYPE_TO_HOLDING_TYPE / METAL_TO_SYMBOL).
 *
 * The HoldingSheet's first field is Type; the chosen UI type drives which fields
 * show and how the holding is priced (behavior):
 *   tracked — Asset autocomplete (filtered to assetClass) + fetched read-only price
 *   manual  — plain name + editable current price
 *   metals  — metal/kind/UoM + spot-fetched price (converted by UoM server-side)
 *   cash    — currency + amount only
 */
import type { HoldingType } from "@/hooks/use-investments";

export type UiType =
  | "stocks"
  | "crypto"
  | "treasury_bond"
  | "collectibles"
  | "real_estate"
  | "other"
  | "precious_metals"
  | "cash"
  | "broker"
  | "deposit"
  | "savings";

export type InvestmentBehavior =
  "tracked" | "manual" | "metals" | "cash" | "broker" | "deposit";

/** Deposit interest capitalization cadence (mirrors the server contract). */
export type CapFrequency =
  "daily" | "monthly" | "quarterly" | "semiannual" | "yearly";
export const CAP_FREQUENCIES: CapFrequency[] = [
  "daily",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
];

export interface UiTypeMeta {
  /** Coarse backend holding_type. */
  holdingType: HoldingType;
  behavior: InvestmentBehavior;
  /** Asset-class filter for the tracked-type autocomplete. */
  assetClass?: string;
}

export const UI_TYPE_META: Record<UiType, UiTypeMeta> = {
  // Phase 13 (D-10): equity + ETF are one type. assetClass "stocks" makes the
  // instrument search return both stocks and ETFs.
  stocks: {
    holdingType: "equities",
    behavior: "tracked",
    assetClass: "stocks",
  },
  crypto: { holdingType: "crypto", behavior: "tracked", assetClass: "crypto" },
  treasury_bond: { holdingType: "bond", behavior: "manual" },
  collectibles: { holdingType: "other", behavior: "manual" },
  real_estate: { holdingType: "real_estate", behavior: "manual" },
  other: { holdingType: "other", behavior: "manual" },
  precious_metals: { holdingType: "commodity", behavior: "metals" },
  cash: { holdingType: "cash_fx", behavior: "cash" },
  broker: { holdingType: "other", behavior: "broker" },
  deposit: { holdingType: "deposit", behavior: "deposit" },
  // Manual savings pot. Own holding_type (own pie slice); reuses the broker
  // field-set (name + starting + current + currency, qty=1) — only labels differ.
  savings: { holdingType: "savings", behavior: "broker" },
};

/** Dropdown order (tracked first, then manual, then metals/cash/broker; the
 *  catch-all "Other" is always last). Also the default type-group order. Stocks &
 *  ETFs is one type since Phase 13 (D-10); legacy equity/etf/reit/etb rows resolve
 *  through deriveUiType. */
export const UI_TYPE_ORDER: UiType[] = [
  "stocks",
  "crypto",
  "treasury_bond",
  "collectibles",
  "real_estate",
  "precious_metals",
  "cash",
  "savings",
  "deposit",
  "broker",
  "other",
];

/** Providers whose price is auto-fetched + read-only in the form. Anything else
 *  (notably the 'manual' sentinel for non-US equities/ETF) is user-priced: the
 *  form shows an editable current-price field and never calls the price endpoint. */
export const AUTO_PRICE_PROVIDERS = [
  "finnhub",
  "coingecko",
  "twelve_data",
] as const;

export function isAutoPriced(provider: string | null | undefined): boolean {
  return (
    !!provider && (AUTO_PRICE_PROVIDERS as readonly string[]).includes(provider)
  );
}

/**
 * The per-unit price (cents, string) behind a typed TOTAL. A row shows
 * quantity × price, so an inline edit of that amount has to be divided back
 * before it is stored as the current price — or a 3-unit holding triples
 * (user, 261023). Rounds to the cent; an unreadable/zero quantity stores the
 * total as-is.
 */
export function unitPriceCents(totalCents: number, quantity: string): string {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return String(totalCents);
  // Sub-cent precision (numeric(24,6) column): 170 over 3 units must multiply
  // back to 170, which no whole-cent unit price does.
  return String(Number((totalCents / qty).toFixed(6)));
}

/**
 * Types the user may VALUE in a currency of their choosing, with the fetched price
 * FX-converted into it. For these the form keeps the currency picker visible even
 * after an instrument is selected, and changing the currency re-fetches converted.
 * - crypto: quoted USD on CoinGecko, valued in the user's currency.
 * - stocks: a US stock/ETF is quoted USD (Finnhub) but can be tracked in the
 *   budget's (or any) currency — default adopts the instrument's own currency when
 *   found in suggestions, else the budget currency; changing it converts via FX.
 * Metals are handled separately by their `metals` behavior.
 */
export function usesUserChosenCurrency(
  uiType: UiType | "" | null | undefined,
): boolean {
  return uiType === "crypto" || uiType === "stocks";
}

export type Metal = "gold" | "silver" | "platinum" | "palladium";
export const METALS: Metal[] = ["gold", "silver", "platinum", "palladium"];
export const METAL_TO_SYMBOL: Record<Metal, string> = {
  gold: "XAU/USD",
  silver: "XAG/USD",
  platinum: "XPT/USD",
  palladium: "XPD/USD",
};

export type MetalKind = "coin" | "bar" | "other";
export const METAL_KINDS: MetalKind[] = ["coin", "bar", "other"];

export type Uom = "g" | "oz" | "kg";
export const UOMS: Uom[] = ["g", "oz", "kg"];

/** Troy ounces per 1 unit — mirrors portfolio-metrics OZ_PER_UNIT (display preview). */
export const OZ_PER_UNIT: Record<Uom, number> = {
  oz: 1,
  g: 0.03215074656862,
  kg: 32.15074656862,
};

/** Best-effort UI type for an existing holding (edit mode) when ui_type is null.
 *  Legacy pre-Phase-13 values (stale rows / stale clients) map to stocks /
 *  treasury_bond (D-11). */
export function deriveUiType(
  uiType: string | null | undefined,
  holdingType: string,
  _isCustom: boolean,
): UiType {
  if (uiType && uiType in UI_TYPE_META) return uiType as UiType;
  if (uiType === "equity" || uiType === "etf" || uiType === "reit")
    return "stocks";
  if (uiType === "etb") return "treasury_bond";
  switch (holdingType) {
    case "equities":
    case "etf":
    case "reit":
      return "stocks";
    case "crypto":
      return "crypto";
    case "commodity":
      return "precious_metals";
    case "cash_fx":
      return "cash";
    case "real_estate":
      return "real_estate";
    case "deposit":
      return "deposit";
    case "savings":
      return "savings";
    case "bond":
      return "treasury_bond";
    default:
      return "other";
  }
}

/** Mirror of the server's holdingShape (Phase 13): quantity holdings sell and
 *  buy by units; amount holdings (qty 1) by value; deposits restart (D-20). */
export function holdingShape(h: {
  holdingType: string;
  uiType: string | null;
  isCustom: boolean;
  quantity: string;
}): "quantity" | "amount" | "deposit" {
  if (h.holdingType === "deposit") return "deposit";
  const ui = deriveUiType(h.uiType, h.holdingType, h.isCustom);
  if (ui === "stocks" || ui === "crypto" || ui === "precious_metals")
    return "quantity";
  return Number(h.quantity) === 1 ? "amount" : "quantity";
}
