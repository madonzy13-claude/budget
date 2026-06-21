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
  | "cash";

export type InvestmentBehavior = "tracked" | "manual" | "metals" | "cash";

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
  etb: { holdingType: "bond", behavior: "tracked", assetClass: "bond" },
  reit: { holdingType: "reit", behavior: "tracked", assetClass: "reit" },
  crypto: { holdingType: "crypto", behavior: "tracked", assetClass: "crypto" },
  treasury_bond: { holdingType: "bond", behavior: "manual" },
  collectibles: { holdingType: "other", behavior: "manual" },
  real_estate: { holdingType: "real_estate", behavior: "manual" },
  other: { holdingType: "other", behavior: "manual" },
  precious_metals: { holdingType: "commodity", behavior: "metals" },
  cash: { holdingType: "cash_fx", behavior: "cash" },
};

/** Dropdown order (tracked first, then manual, then metals, then cash). */
export const UI_TYPE_ORDER: UiType[] = [
  "equity",
  "etf",
  "etb",
  "reit",
  "crypto",
  "treasury_bond",
  "collectibles",
  "real_estate",
  "other",
  "precious_metals",
  "cash",
];

export type Metal = "gold" | "silver" | "platinum";
export const METALS: Metal[] = ["gold", "silver", "platinum"];
export const METAL_TO_SYMBOL: Record<Metal, string> = {
  gold: "XAU/USD",
  silver: "XAG/USD",
  platinum: "XPT/USD",
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
    case "bond":
      return isCustom ? "treasury_bond" : "etb";
    default:
      return "other";
  }
}
