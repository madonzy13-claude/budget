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
import { useTranslations } from "next-intl";
import {
  nextCustomizerFocus,
  type GridPos,
  type GridNavKey,
  type GridSection,
} from "@/lib/customizer-nav";

// Palette key matches the i18n key in `bdp.tab.wallets.customizer.palette.*`.
// The component looks up the human-readable color name through next-intl
// so the screen-reader label localises with the rest of the UI.
const PALETTE: { key: string; value: string }[] = [
  { key: "red", value: "#e63946" },
  { key: "amber", value: "#f4a261" },
  { key: "yellow", value: "#f6c453" },
  { key: "green", value: "#52b788" },
  { key: "teal", value: "#2a9d8f" },
  { key: "sky", value: "#4cc9f0" },
  { key: "indigo", value: "#5a67d8" },
  { key: "pink", value: "#e879f9" },
];

export interface IconOption {
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const ICONS: IconOption[] = [
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
  onChange: (patch: { color?: string | null; icon?: string | null }) => void;
  ariaLabel: string;
  /** Icon set to offer; defaults to the wallet set. Possessions pass their own. */
  icons?: IconOption[];
  /** Show the color grid. false = icon-only picker (possessions). Default true. */
  showColor?: boolean;
}

export function WalletCustomizer({
  color,
  icon,
  onChange,
  ariaLabel,
  icons = ICONS,
  showColor = true,
}: WalletCustomizerProps) {
  const t = useTranslations("bdp.tab.wallets.customizer");
  const [open, setOpen] = React.useState(false);
  const Icon = icons.find((i) => i.name === icon)?.Icon ?? Circle;
  const triggerColor = color ?? "var(--muted-foreground)";

  // 260724 (task 3): keyboard grid nav inside the popover. Sections are the color
  // swatch row (when shown) then the icon grid. Buttons register into a 2D ref
  // grid; ←/→ step within a section, ↑/↓ jump sections, Enter/Space apply (native
  // button click), Esc closes (Radix default). `iconSec` is section 1 with color
  // shown, else 0.
  const colorSec = showColor ? 0 : -1;
  const iconSec = showColor ? 1 : 0;
  // Grid layout per section — color row is grid-cols-8, icon grid is grid-cols-6
  // (must match the className grids below so ↑/↓ row math lines up visually).
  const sectionSizes: GridSection[] = showColor
    ? [
        { count: PALETTE.length, cols: 8 },
        { count: icons.length, cols: 6 },
      ]
    : [{ count: icons.length, cols: 6 }];
  const btnRefs = React.useRef<HTMLButtonElement[][]>([]);
  const posRef = React.useRef<GridPos>({ section: 0, index: 0 });
  const registerBtn =
    (section: number, index: number) => (el: HTMLButtonElement | null) => {
      if (!el) return;
      (btnRefs.current[section] ??= [])[index] = el;
    };
  const focusPos = (pos: GridPos) => {
    posRef.current = pos;
    btnRefs.current[pos.section]?.[pos.index]?.focus();
  };
  const onContentKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key;
    if (
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "ArrowUp" &&
      key !== "ArrowDown"
    )
      return;
    e.preventDefault();
    focusPos(nextCustomizerFocus(posRef.current, key as GridNavKey, sectionSizes));
  };
  // On open, land on the currently-selected swatch/icon (else the first item).
  const onOpenAutoFocus = (e: Event) => {
    e.preventDefault();
    let pos: GridPos = { section: showColor ? 0 : iconSec, index: 0 };
    if (showColor && color) {
      const i = PALETTE.findIndex((c) => c.value === color);
      if (i >= 0) pos = { section: colorSec, index: i };
    } else if (icon) {
      const i = icons.findIndex((ic) => ic.name === icon);
      if (i >= 0) pos = { section: iconSec, index: i };
    }
    posRef.current = pos;
    requestAnimationFrame(() => focusPos(pos));
  };

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
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
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
        onKeyDown={onContentKeyDown}
        onOpenAutoFocus={onOpenAutoFocus}
        // 260725 (item 1): Radix returns focus to the trigger on close, which trips
        // :focus-visible → a stray yellow ring around the icon after Esc. Prevent
        // the auto-refocus (focus falls to <body>; the roving nav still gets keys).
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {showColor && (
        <div className="space-y-1.5">
          <div className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
            {t("color")}
          </div>
          <div className="grid grid-cols-8 gap-1">
            {PALETTE.map((c, i) => (
              <button
                key={c.value}
                ref={registerBtn(colorSec, i)}
                type="button"
                aria-label={t("colorAria", { name: t(`palette.${c.key}`) })}
                onClick={() => onChange({ color: c.value })}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform hover:scale-110",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-1",
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
              {t("clearColor")}
            </button>
          )}
        </div>
        )}

        <div className="space-y-1.5">
          <div className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
            {t("icon")}
          </div>
          <div className="grid grid-cols-6 gap-1">
            {icons.map(({ name, Icon: IconC }, i) => (
              <button
                key={name}
                ref={registerBtn(iconSec, i)}
                type="button"
                aria-label={t("iconAria", { name })}
                onClick={() => onChange({ icon: name })}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
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
              {t("clearIcon")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
