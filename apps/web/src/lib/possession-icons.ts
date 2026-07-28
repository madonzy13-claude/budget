/**
 * possession-icons.ts — curated icon set for the Possessions wallet section.
 *
 * Mirrors the wallet-customizer approach (a small, bundle-friendly curated set,
 * NOT a full lucide picker) but with icons that fit physical possessions:
 * house, car, electronics, jewelry, tools, sport gear, cash, etc. The chosen
 * icon is stored as its `name` string on the holding (`icon` column).
 */
import type { ComponentType } from "react";
import {
  Home,
  Car,
  Laptop,
  Gem,
  Wrench,
  Dumbbell,
  Banknote,
  Sofa,
  Palette,
  Watch,
  Bike,
  Ship,
  Package,
} from "lucide-react";

export interface PossessionIcon {
  name: string;
  Icon: ComponentType<{ className?: string }>;
}

export const POSSESSION_ICONS: PossessionIcon[] = [
  { name: "home", Icon: Home },
  { name: "car", Icon: Car },
  { name: "electronics", Icon: Laptop },
  { name: "jewelry", Icon: Gem },
  { name: "tools", Icon: Wrench },
  { name: "sport", Icon: Dumbbell },
  { name: "cash", Icon: Banknote },
  { name: "furniture", Icon: Sofa },
  { name: "art", Icon: Palette },
  { name: "watch", Icon: Watch },
  { name: "bike", Icon: Bike },
  { name: "boat", Icon: Ship },
  // Fallback / catch-all.
  { name: "other", Icon: Package },
];

/** Resolve a stored icon key to its component; defaults to the catch-all box. */
export function possessionIconByName(
  name: string | null | undefined,
): ComponentType<{ className?: string }> {
  return POSSESSION_ICONS.find((i) => i.name === name)?.Icon ?? Package;
}
