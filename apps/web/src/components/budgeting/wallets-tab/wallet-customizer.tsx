"use client";
/**
 * wallet-customizer.tsx — Tiny popover that picks a color + icon for a wallet.
 *
 * UAT-PH5-T3-1x. Default state for a wallet is `color: null, icon: null`,
 * which renders as a small dashed circle (placeholder) to the left of the
 * name. With both color and icon set, the trigger and the row render the
 * icon in the selected color. The popover lets the user pick from a small
 * curated palette + a curated lucide icon set, or clear both back to null.
 *
 * Kept curated on purpose — a full lucide picker would be overkill at this
 * size and would hurt the bundle.
 */
import * as React from "react";
import {
  Wallet as WalletIcon,
  PiggyBank,
  CreditCard,
  Landmark,
  Coins,
  Banknote,
  Briefcase,
  Home as HomeIcon,
  Car,
  Plane,
  Heart,
  ShoppingCart,
  Circle,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PALETTE: { name: string; value: string }[] = [
  { name: "Red", value: "#e63946" },
  { name: "Amber", value: "#f4a261" },
  { name: "Yellow", value: "#f6c453" },
  { name: "Green", value: "#52b788" },
  { name: "Teal", value: "#2a9d8f" },
  { name: "Sky", value: "#4cc9f0" },
  { name: "Indigo", value: "#5a67d8" },
  { name: "Pink", value: "#e879f9" },
];

const ICONS: { name: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { name: "wallet", Icon: WalletIcon },
  { name: "piggy-bank", Icon: PiggyBank },
  { name: "credit-card", Icon: CreditCard },
  { name: "landmark", Icon: Landmark },
  { name: "coins", Icon: Coins },
  { name: "banknote", Icon: Banknote },
  { name: "briefcase", Icon: Briefcase },
  { name: "home", Icon: HomeIcon },
  { name: "car", Icon: Car },
  { name: "plane", Icon: Plane },
  { name: "heart", Icon: Heart },
  { name: "shopping-cart", Icon: ShoppingCart },
];

export function iconByName(name: string | null | undefined) {
  if (!name) return null;
  return ICONS.find((i) => i.name === name)?.Icon ?? null;
}

export interface WalletCustomizerProps {
  color: string | null;
  icon: string | null;
  onChange: (patch: {
    color?: string | null;
    icon?: string | null;
  }) => void;
  ariaLabel: string;
}

export function WalletCustomizer({
  color,
  icon,
  onChange,
  ariaLabel,
}: WalletCustomizerProps) {
  const [open, setOpen] = React.useState(false);
  const Icon = iconByName(icon) ?? Circle;
  const triggerColor = color ?? "var(--muted-foreground)";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          data-testid="wallet-customizer-trigger"
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
            icon || color
              ? "border border-transparent"
              : "border border-dashed border-[var(--muted-foreground)]/60",
            "hover:bg-[var(--surface-elevated-dark)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--info)]",
          )}
          style={{ color: triggerColor }}
        >
          {icon ? (
            <Icon className="size-4" />
          ) : (
            <Circle
              className="size-3 text-[var(--muted-foreground)]/60"
              aria-hidden="true"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[60] w-[240px] space-y-3 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <div className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
            Color
          </div>
          <div className="grid grid-cols-8 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={`Color ${c.name}`}
                onClick={() => onChange({ color: c.value })}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform hover:scale-110",
                  color === c.value
                    ? "border-[var(--on-dark)]"
                    : "border-transparent",
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
          {color && (
            <button
              type="button"
              onClick={() => onChange({ color: null })}
              className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline"
            >
              Clear color
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
            Icon
          </div>
          <div className="grid grid-cols-6 gap-1">
            {ICONS.map(({ name, Icon: IconC }) => (
              <button
                key={name}
                type="button"
                aria-label={`Icon ${name}`}
                onClick={() => onChange({ icon: name })}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded transition-colors",
                  icon === name
                    ? "bg-[var(--primary)] text-[var(--on-primary)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body-on-dark)]",
                )}
              >
                <IconC className="size-4" />
              </button>
            ))}
          </div>
          {icon && (
            <button
              type="button"
              onClick={() => onChange({ icon: null })}
              className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline"
            >
              Clear icon
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
