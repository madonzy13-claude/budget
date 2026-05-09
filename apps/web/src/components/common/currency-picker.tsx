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

interface CurrencyPickerProps {
  value?: string;
  onSelect: (currency: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * Currency picker — Radix Select that pairs every code with its localized
 * name and symbol. Matches visual style of language/voice/llm dropdowns.
 */
export function CurrencyPicker({
  value,
  onSelect,
  placeholder,
  disabled = false,
  "aria-label": ariaLabel,
}: CurrencyPickerProps) {
  const t = useTranslations("currency");
  const effectivePlaceholder = placeholder ?? t("picker.placeholder");

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
        {TOP_CURRENCIES.map((currency) => {
          const localizedName = t(`names.${currency.code}`);
          return (
            <SelectItem
              key={currency.code}
              value={currency.code}
              data-testid={`currency-option-${currency.code}`}
            >
              <span className="flex items-center gap-2">
                <span className="num text-[var(--primary)]">
                  {currency.code}
                </span>
                <span className="text-[var(--muted-foreground)]">
                  {localizedName}
                </span>
                <span className="num text-sm text-[var(--muted-foreground)]">
                  {currency.symbol}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
