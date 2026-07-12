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
  | "equity"
  | "etf"
  | "etb"
  | "reit"
  | "crypto"
  | "treasury_bond"
  | "collectibles"
  | "real_estate"
  | "other"
  | "precious_metals"
  | "cash"
  | "broker"
  | "deposit";

export type InvestmentBehavior =
  | "tracked"
  | "manual"
  | "metals"
  | "cash"
  | "broker"
  | "deposit";

/** Deposit interest capitalization cadence (mirrors the server contract). */
export type CapFrequency =
  | "daily"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly";
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
  equity: {
    holdingType: "equities",
    behavior: "tracked",
    assetClass: "equities",
  },
  etf: { holdingType: "etf", behavior: "tracked", assetClass: "etf" },
  // The catalog (Twelve Data) doesn't tag REITs or exchange-traded bonds as their
  // own class — a REIT is an `equities` row, a bond ETF is an `etf` row. So DON'T
  // filter their autocomplete (would be empty); search the whole universe and keep
  // the user's REIT/ETB tag on the holding via ui_type / holding_type.
  etb: { holdingType: "bond", behavior: "tracked" },
  reit: { holdingType: "reit", behavior: "tracked" },
  crypto: { holdingType: "crypto", behavior: "tracked", assetClass: "crypto" },
  treasury_bond: { holdingType: "bond", behavior: "manual" },
  collectibles: { holdingType: "other", behavior: "manual" },
  real_estate: { holdingType: "real_estate", behavior: "manual" },
  other: { holdingType: "other", behavior: "manual" },
  precious_metals: { holdingType: "commodity", behavior: "metals" },
  cash: { holdingType: "cash_fx", behavior: "cash" },
  broker: { holdingType: "other", behavior: "broker" },
  deposit: { holdingType: "deposit", behavior: "deposit" },
};

/** Dropdown order (tracked first, then manual, then metals/cash/broker; the
 *  catch-all "Other" is always last). REIT + exchange-traded bonds were dropped —
 *  the catalog has no separate class for them; track via Equity/ETF + a Group. The
 *  `reit`/`etb` UI types still exist (deriveUiType/edit) for any pre-existing rows. */
export const UI_TYPE_ORDER: UiType[] = [
  "equity",
  "etf",
  "crypto",
  "treasury_bond",
  "collectibles",
  "real_estate",
  "precious_metals",
  "cash",
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
 * Types quoted in a FIXED currency upstream (crypto → USD on CoinGecko) but which
 * the user VALUES in a currency of their choosing — like precious metals. For
 * these the form keeps the currency picker visible even after an instrument is
 * selected (instead of locking to the instrument's quote currency), and the
 * read-only fetched price is FX-converted to the chosen currency. 260626: crypto
 * only; metals are already handled by their `metals` behavior.
 */
export function usesUserChosenCurrency(
  uiType: UiType | "" | null | undefined,
): boolean {
  return uiType === "crypto";
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

/** Best-effort UI type for an existing holding (edit mode) when ui_type is null. */
export function deriveUiType(
  uiType: string | null | undefined,
  holdingType: string,
  isCustom: boolean,
): UiType {
  if (uiType && uiType in UI_TYPE_META) return uiType as UiType;
  switch (holdingType) {
    case "equities":
      return "equity";
    case "etf":
      return "etf";
    case "reit":
      return "reit";
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
    case "bond":
      return isCustom ? "treasury_bond" : "etb";
    default:
      return "other";
  }
}
