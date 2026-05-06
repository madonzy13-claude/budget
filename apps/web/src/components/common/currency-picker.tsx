"use client";

import { useState } from "react";
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

// UI-SPEC §Currency picker: top-8 deterministic list for Phase 1
// Later phases will personalize based on user history
export const TOP_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
] as const;

export type CurrencyCode = (typeof TOP_CURRENCIES)[number]["code"];

interface CurrencyPickerProps {
  value?: string;
  onSelect: (currency: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function CurrencyPicker({
  value,
  onSelect,
  placeholder = "Search currency...",
  disabled = false,
  "aria-label": ariaLabel,
}: CurrencyPickerProps) {
  const [open, setOpen] = useState(false);

  const selected = TOP_CURRENCIES.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? "Select currency"}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selected ? (
            <span>
              <span className="font-mono">{selected.code}</span>
              {" — "}
              {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup heading="Top currencies">
              {TOP_CURRENCIES.map((currency) => (
                <CommandItem
                  key={currency.code}
                  value={`${currency.code} ${currency.name}`}
                  onSelect={() => {
                    onSelect(currency.code);
                    setOpen(false);
                  }}
                  data-testid={`currency-option-${currency.code}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === currency.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono text-primary">
                    {currency.code}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {currency.name}
                  </span>
                  <span className="ml-auto font-mono text-sm">
                    {currency.symbol}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
