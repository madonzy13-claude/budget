"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
 * Currency picker — combobox that pairs every code with its localized name
 * and symbol. Code renders in tabular numerals using the brand-yellow tint
 * so the chosen currency is the loudest token in any list it appears in.
 */
export function CurrencyPicker({
  value,
  onSelect,
  placeholder,
  disabled = false,
  "aria-label": ariaLabel,
}: CurrencyPickerProps) {
  const t = useTranslations("currency");
  const [open, setOpen] = useState(false);
  const effectivePlaceholder = placeholder ?? t("picker.placeholder");

  const selected = TOP_CURRENCIES.find((c) => c.code === value);
  const selectedName = selected ? t(`names.${selected.code}`) : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? t("picker.aria_label")}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="num text-[var(--primary)]">{selected.code}</span>
              <span className="text-[var(--muted-foreground)]">·</span>
              <span>{selectedName}</span>
            </span>
          ) : (
            <span className="text-[var(--muted-foreground)]">
              {effectivePlaceholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder={effectivePlaceholder} />
          <CommandList>
            <CommandEmpty>{t("picker.empty")}</CommandEmpty>
            <CommandGroup heading={t("picker.heading")}>
              {TOP_CURRENCIES.map((currency) => {
                const localizedName = t(`names.${currency.code}`);
                return (
                  <CommandItem
                    key={currency.code}
                    value={`${currency.code} ${localizedName}`}
                    onSelect={() => {
                      onSelect(currency.code);
                      setOpen(false);
                    }}
                    data-testid={`currency-option-${currency.code}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 text-[var(--primary)]",
                        value === currency.code ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="num text-[var(--primary)]">
                      {currency.code}
                    </span>
                    <span className="ml-2 text-[var(--muted-foreground)]">
                      {localizedName}
                    </span>
                    <span className="num ml-auto text-sm text-[var(--muted-foreground)]">
                      {currency.symbol}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
