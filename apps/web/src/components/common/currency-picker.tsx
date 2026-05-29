"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Phase 1: deterministic top-8 list. Personalization comes later.
export const TOP_CURRENCIES = [
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "PLN", symbol: "zł" },
  { code: "GBP", symbol: "£" },
  { code: "UAH", symbol: "₴" },
  { code: "CHF", symbol: "Fr" },
  { code: "NOK", symbol: "kr" },
  { code: "SEK", symbol: "kr" },
] as const;

export type CurrencyCode = (typeof TOP_CURRENCIES)[number]["code"];

export interface CurrencyOption {
  value: string;
  label: string;
  symbol?: string | null;
  kind?: "FIAT" | "CRYPTO";
}

interface CurrencyPickerProps {
  value?: string;
  onSelect: (currency: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  /**
   * When provided, renders only these options (allowlist-bound mode).
   * Used by forms that source options from `listSupportedCurrencies()` server action.
   * When omitted, falls back to the built-in TOP_CURRENCIES list (Phase 1 compat).
   */
  options?: CurrencyOption[];
  /**
   * Visual variant:
   *   `inline` (default) — bare 3-letter text, no border or background.
   *     Designed for inline-edit cells (wallet rows) where the resting
   *     state must look like static text.
   *   `field` — full form-field chrome: h-10, border, padded bg, chevron
   *     hint via the native `appearance: revert` (system-native arrow).
   *     Used by the transaction + recurring sliders so the picker
   *     reads as an input alongside the Amount field, on every device
   *     including iPhone (UAT-Phase6-Test7 retest #6).
   */
  variant?: "inline" | "field";
}

/**
 * Currency picker — Radix Select that pairs every code with its localized
 * name and symbol. Matches visual style of language/voice/llm dropdowns.
 *
 * When `options` prop is provided, only those codes are rendered (allowlist mode).
 * When `options` is omitted, falls back to the built-in TOP_CURRENCIES list.
 */
export function CurrencyPicker({
  value,
  onSelect,
  placeholder,
  disabled = false,
  "aria-label": ariaLabel,
  options,
  variant = "inline",
}: CurrencyPickerProps) {
  const t = useTranslations("currency");
  const effectivePlaceholder = placeholder ?? t("picker.placeholder");

  // Build rendered items from options prop (allowlist) or TOP_CURRENCIES fallback.
  const items: CurrencyOption[] = options
    ? options
    : TOP_CURRENCIES.map((c) => ({
        value: c.code,
        label: c.code,
        symbol: c.symbol,
        kind: "FIAT",
      }));

  // UAT-PH5-T3-40: render a native <select> on touch devices. Radix
  // Select uses a portaled custom popover that does not reliably open
  // on iOS Safari (even after we removed scrollable parents). The
  // native picker is iOS-friendly, opens the system wheel, and avoids
  // the entire popover positioning + focus-management surface.
  // Lazy initializer so the value is correct on the first render —
  // CurrencyPicker only mounts inside an inline-edit cell after the
  // user taps, so this always runs client-side and there is no SSR
  // mismatch to worry about. Returning the right picker on first paint
  // avoids a flash of Radix before swapping to native.
  const [isTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches ||
      (navigator.maxTouchPoints ?? 0) > 0
    );
  });

  if (isTouch) {
    const fieldClass =
      variant === "field"
        ? // Match SelectTrigger's styling 1:1 (h-10, border, padded bg)
          // so the native iOS picker reads as a form input next to the
          // Amount field. We keep `appearance:none` to suppress the
          // OS chevron then paint our own SVG via background-image —
          // matches what Radix renders in the desktop variant.
          [
            "appearance-none [-webkit-tap-highlight-color:transparent]",
            "flex h-10 w-full items-center px-3 py-2",
            "rounded-[var(--radius-md)] border border-[var(--input)]",
            "bg-[color-mix(in_oklab,var(--card)_92%,transparent)]",
            "text-base sm:text-sm text-[var(--foreground)]",
            // System-native chevron via SVG background — sits ~12px from
            // the right edge, sized to match the Radix variant.
            "bg-no-repeat",
            "[background-image:url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>\")]",
            "[background-position:right_10px_center]",
            "pr-9",
            "focus:outline-2 focus:outline-offset-2 focus:outline-[var(--info)]",
          ]
        : // Original inline-cell styling — preserves the bare-text
          // appearance used by inline-edit cells in wallet rows.
          [
            "appearance-none [-webkit-tap-highlight-color:transparent]",
            "w-full bg-transparent p-0 m-0 border-0",
            "text-num-md text-[var(--foreground)]",
            "focus:outline-none focus:shadow-none focus:border-0",
          ];
    return (
      <select
        aria-label={ariaLabel ?? t("picker.aria_label")}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value)}
        data-testid="currency-picker-native"
        data-variant={variant}
        className={fieldClass.join(" ")}
      >
        {!value && (
          <option value="" disabled>
            {effectivePlaceholder}
          </option>
        )}
        {items.map((item) => (
          // UAT-PH5-T3-44: 3-letter code only. Native <select> trigger
          // mirrors the SELECTED option's text content, so any symbol
          // or localized name we append here would render in the
          // resting cell ("EUR €" / "EUR — Euro") and overflow.
          // The iOS picker still shows the 3-letter code, which is
          // the universally recognised identifier; localized names
          // live in the desktop Radix variant.
          <option
            key={item.value}
            value={item.value}
            data-testid={`currency-option-${item.value}`}
          >
            {item.value}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Select
      {...(value ? { value } : {})}
      onValueChange={onSelect}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel ?? t("picker.aria_label")}>
        {/* Trigger displays only the 3-letter code so it stays compact even in
            narrow form fields. Dropdown items keep the full code + name + symbol
            for selection clarity. */}
        <SelectValue placeholder={effectivePlaceholder}>
          {value ? (
            <span className="num text-[var(--primary)]">{value}</span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => {
          // For TOP_CURRENCIES fallback, try to get localized name.
          const localizedName = options
            ? item.label
            : (() => {
                try {
                  return t(`names.${item.value}`);
                } catch {
                  return item.label;
                }
              })();
          return (
            <SelectItem
              key={item.value}
              value={item.value}
              data-testid={`currency-option-${item.value}`}
            >
              <span className="flex items-center gap-2">
                <span className="num text-[var(--primary)]">{item.value}</span>
                <span className="text-[var(--muted-foreground)]">
                  {localizedName}
                </span>
                {item.symbol && (
                  <span className="num text-sm text-[var(--muted-foreground)]">
                    {item.symbol}
                  </span>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
