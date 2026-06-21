"use client";
/**
 * group-combobox.tsx — Group autocomplete (Phase 9, INV-05, no-analog).
 *
 * shadcn Popover + Command combobox. Filters existing budget group names and
 * accepts free-typed new groups. Selecting an existing name or creating a new
 * one sets the holding's group; clearing sets it to null (Ungrouped).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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

interface GroupComboboxProps {
  value: string | null;
  /** Distinct existing group names in the budget. */
  groups: string[];
  onChange: (value: string | null) => void;
  "aria-label"?: string;
}

export function GroupCombobox({
  value,
  groups,
  onChange,
  "aria-label": ariaLabel,
}: GroupComboboxProps) {
  const t = useTranslations("budget.investments");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const hasExact = groups.some(
    (g) => g.toLowerCase() === trimmed.toLowerCase(),
  );

  function select(next: string | null) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? t("field.group")}
          data-testid="holding-sheet-group"
          className="w-full justify-between font-normal"
        >
          <span
            className={value ? "" : "text-[var(--muted-foreground)]"}
          >
            {value ?? t("field.groupPlaceholder")}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput
            placeholder={t("field.group")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{t("group.noGroups")}</CommandEmpty>
            <CommandGroup>
              {/* Ungrouped clear option */}
              <CommandItem
                value="__ungrouped__"
                onSelect={() => select(null)}
              >
                <Check
                  className={[
                    "mr-2 h-4 w-4",
                    value === null ? "opacity-100" : "opacity-0",
                  ].join(" ")}
                />
                {t("field.groupPlaceholder")}
              </CommandItem>
              {groups.map((g) => (
                <CommandItem key={g} value={g} onSelect={() => select(g)}>
                  <Check
                    className={[
                      "mr-2 h-4 w-4",
                      value === g ? "opacity-100" : "opacity-0",
                    ].join(" ")}
                  />
                  {g}
                </CommandItem>
              ))}
              {trimmed.length > 0 && !hasExact && (
                <CommandItem
                  value={`__create__${trimmed}`}
                  onSelect={() => select(trimmed)}
                  data-testid="holding-sheet-group-create"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("group.create", { name: trimmed })}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
