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
  type LucideIcon,
} from "lucide-react";
import {
  deriveUiType,
  type UiType,
} from "@/lib/investment-types";
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
};

/** Fixed accent color per type (hex; applied as the icon color). */
export const UI_TYPE_COLOR: Record<UiType, string> = {
  equity: "#4ea1ff", // blue
  etf: "#2dd4bf", // teal
  etb: "#a3a3a3", // grey (bonds)
  reit: "#c084fc", // purple
  crypto: "#f7931a", // bitcoin orange
  treasury_bond: "#34d399", // green
  collectibles: "#f472b6", // pink
  real_estate: "#fbbf24", // amber
  other: "#94a3b8", // slate
  precious_metals: "#eab308", // gold
  cash: "#22c55e", // green
  broker: "#818cf8", // indigo
};

/** Icon + color for a holding, resolved from its (derived) UI type. */
export function holdingIcon(h: {
  uiType: HoldingDto["uiType"];
  holdingType: HoldingDto["holdingType"];
  isCustom: HoldingDto["isCustom"];
}): { Icon: LucideIcon; color: string } {
  const ut = deriveUiType(h.uiType, h.holdingType, h.isCustom);
  return { Icon: UI_TYPE_ICON[ut], color: UI_TYPE_COLOR[ut] };
}
