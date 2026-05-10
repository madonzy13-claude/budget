"use client";

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

  return (
    <Select
      {...(value ? { value } : {})}
      onValueChange={onSelect}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel ?? t("picker.aria_label")}>
        <SelectValue placeholder={effectivePlaceholder} />
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
