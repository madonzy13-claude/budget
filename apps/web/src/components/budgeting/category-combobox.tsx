"use client";
/**
 * category-combobox.tsx — pick an existing category or name a new one, without
 * leaving the form you are in (user, 261014).
 *
 * The scheduled-payment form offered a plain Select over the categories that
 * already existed, so a payment for something new meant abandoning the form,
 * creating the category elsewhere and starting over — and on a budget with no
 * categories the picker did not render at all, leaving no way through.
 *
 * Modelled on the investments GroupCombobox the household already uses: type to
 * filter, and when nothing matches the first row takes what was typed.
 *
 * It creates NOTHING. Naming a category here records the INTENT; the form
 * creates it on submit, immediately before the rule that will carry it, so a
 * form left unfinished leaves no stray category behind. That is also what keeps
 * this a pure control with no network of its own.
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

/** An existing category, or a name the form should create on save. */
export type CategoryChoice =
  | { kind: "existing"; id: string }
  | { kind: "new"; name: string };

export function CategoryCombobox({
  categories,
  value,
  onChange,
  id,
  "aria-label": ariaLabel,
}: {
  categories: { id: string; name: string }[];
  value: CategoryChoice | null;
  onChange: (next: CategoryChoice | null) => void;
  id?: string;
  "aria-label"?: string;
}) {
  const t = useTranslations("budgeting.scheduled");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const hasExact = categories.some(
    (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const shown = trimmed
    ? categories.filter((c) =>
        c.name.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : categories;

  const label =
    value === null
      ? t("rule.categoryPlaceholder")
      : value.kind === "new"
        ? value.name
        : (categories.find((c) => c.id === value.id)?.name ??
          t("rule.categoryPlaceholder"));

  function pick(next: CategoryChoice | null) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? t("rule.categoryLabel")}
          data-testid="category-combobox-trigger"
          // Match the sibling fields (Input / SelectTrigger): grey field fill
          // and a hairline border, not the outline button's transparent dark.
          className="h-10 w-full justify-between border border-[var(--input)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)] !px-3 py-2 text-base font-normal text-[var(--foreground)] sm:text-sm"
        >
          <span className="truncate text-[var(--foreground)]">{label}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        // Don't steal focus into the search box on open: on mobile that throws
        // the keyboard up over the whole field. Tap a category, or tap the box
        // to type. (Same reasoning as GroupCombobox.)
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("rule.categoryLabel")}
            value={query}
            onValueChange={setQuery}
            data-testid="category-combobox-input"
          />
          <CommandList>
            <CommandEmpty>{t("rule.categoryNoMatch")}</CommandEmpty>
            <CommandGroup>
              {trimmed.length > 0 && !hasExact && (
                // First, so the thing the member just typed is under the
                // thumb rather than below a list they have already rejected.
                <CommandItem
                  value={`__create__${trimmed}`}
                  onSelect={() => pick({ kind: "new", name: trimmed })}
                  data-testid="category-combobox-create"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("rule.categoryCreate", { name: trimmed })}
                </CommandItem>
              )}
              {shown.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => pick({ kind: "existing", id: c.id })}
                >
                  <Check
                    className={[
                      "mr-2 h-4 w-4",
                      value?.kind === "existing" && value.id === c.id
                        ? "opacity-100"
                        : "opacity-0",
                    ].join(" ")}
                  />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
