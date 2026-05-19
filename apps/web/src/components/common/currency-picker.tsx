"use client";

import { useEffect, useState } from "react";
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
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(pointer: coarse)");
    setIsTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (isTouch) {
    return (
      <select
        aria-label={ariaLabel ?? t("picker.aria_label")}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value)}
        data-testid="currency-picker-native"
        // appearance-none + tap-highlight-transparent + focus:border --primary
        // so the native control matches the InlineEditCell editor design;
        // outside of focus it still looks like a token-styled field.
        className={[
          "appearance-none [-webkit-tap-highlight-color:transparent]",
          "flex h-9 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--input)]",
          "bg-[color-mix(in_oklab,var(--card)_92%,transparent)]",
          "px-3 text-base sm:text-sm text-[var(--foreground)]",
          "focus:border-[var(--primary)] focus:outline-none focus:shadow-none",
        ].join(" ")}
      >
        {!value && (
          <option value="" disabled>
            {effectivePlaceholder}
          </option>
        )}
        {items.map((item) => {
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
            <option
              key={item.value}
              value={item.value}
              data-testid={`currency-option-${item.value}`}
            >
              {item.value}
              {item.symbol ? ` ${item.symbol}` : ""}
              {localizedName && localizedName !== item.value
                ? ` — ${localizedName}`
                : ""}
            </option>
          );
        })}
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
