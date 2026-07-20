/**
 * investment-icons.ts — per-type icon + accent color for investments.
 *
 * Single source of truth shared by the Type picker (HoldingSheet) and the list
 * rows (InvestmentRow) so the icon for a type is identical everywhere. Colors are
 * fixed (not user-configurable) — a small, distinct palette readable on the dark
 * canvas so the user can scan the list by asset type at a glance.
 */
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
  Briefcase,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";
import { deriveUiType, type UiType } from "@/lib/investment-types";
import type { HoldingDto } from "@/hooks/use-investments";

export const UI_TYPE_ICON: Record<UiType, LucideIcon> = {
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
  broker: Briefcase,
  deposit: PiggyBank,
};

/**
 * Fixed accent color per type (hex; icon color + investments pie slice). Hues are
 * spread around the wheel so every type is visually distinct — no two share a
 * family (the old map had three near-identical greens and two golds/greys).
 */
export const UI_TYPE_COLOR: Record<UiType, string> = {
  equity: "#3b82f6", // blue
  etf: "#06b6d4", // cyan
  etb: "#94a3b8", // light slate (bonds)
  reit: "#a855f7", // purple
  crypto: "#f7931a", // bitcoin orange
  treasury_bond: "#10b981", // emerald
  collectibles: "#ec4899", // magenta/pink
  real_estate: "#8b5a2b", // brown
  other: "#475569", // dark slate
  precious_metals: "#eab308", // gold
  cash: "#52b788", // rgb(82, 183, 136) — green
  broker: "#6366f1", // indigo
  deposit: "#14b8a6", // teal
};

/** Light silver-grey accent for the non-gold precious metals (silver, platinum,
 *  palladium). Chosen LIGHT so it stands out on the dark grey investment card
 *  (--canvas/surface-dark) instead of blending into it. Gold keeps its yellow. */
const SILVER_METAL_COLOR = "#cbd5e1";
const SILVER_METALS = new Set(["silver", "platinum", "palladium"]);

/** Icon + color for a holding, resolved from its (derived) UI type. The precious-
 *  metals accent is metal-aware: gold stays yellow; the silvery metals render grey. */
export function holdingIcon(h: {
  uiType: HoldingDto["uiType"];
  holdingType: HoldingDto["holdingType"];
  isCustom: HoldingDto["isCustom"];
  metal?: HoldingDto["metal"];
}): { Icon: LucideIcon; color: string } {
  const ut = deriveUiType(h.uiType, h.holdingType, h.isCustom);
  const color =
    ut === "precious_metals" && h.metal && SILVER_METALS.has(h.metal)
      ? SILVER_METAL_COLOR
      : UI_TYPE_COLOR[ut];
  return { Icon: UI_TYPE_ICON[ut], color };
}
