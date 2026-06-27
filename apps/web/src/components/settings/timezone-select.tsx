"use client";
/**
 * timezone-select.tsx — searchable IANA timezone picker for General settings.
 *
 * Popover + Command combobox (mirrors GroupCombobox) over the runtime's tz list.
 * On select: PUT /settings/timezone, optimistic local state, toast on success/
 * rollback on error (mirrors DisplayCurrencyPicker). Each item shows the zone id +
 * its current UTC offset (e.g. "Europe/Warsaw  GMT+2").
 */
import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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
import { listTimezones, tzOffsetLabel } from "@/lib/timezones";
import { api } from "@/lib/api-client";

interface TimezoneSelectProps {
  initialTimezone?: string;
}

export function TimezoneSelect({ initialTimezone }: TimezoneSelectProps) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [tz, setTz] = useState(initialTimezone ?? "UTC");
  const [saving, setSaving] = useState(false);

  // Zone list + current offset label, computed once per mount.
  const zones = useMemo(() => {
    return listTimezones().map((zone) => ({
      zone,
      offset: tzOffsetLabel(zone, locale),
    }));
  }, [locale]);

  const currentOffset = useMemo(() => tzOffsetLabel(tz, locale), [tz, locale]);

  async function select(next: string) {
    if (next === tz) {
      setOpen(false);
      return;
    }
    const previous = tz;
    setTz(next);
    setOpen(false);
    setSaving(true);
    try {
      const res = await api.settings.timezone.$put({
        json: { timezone: next },
      });
      if (!res.ok) throw new Error("Failed to update timezone");
      // Tell already-mounted siblings (e.g. the sessions list) to re-render their
      // timestamps in the new zone — getSession's cookie cache is stale until the
      // next full load, so a shared event is the reliable live signal.
      window.dispatchEvent(
        new CustomEvent("budget:timezone-changed", { detail: next }),
      );
      toast.success(t("save_success"));
    } catch {
      setTz(previous);
      toast.error(
        t("error_save", { defaultValue: "Failed to save. Try again." }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={t("timezone.label")}
            data-testid="timezone-select"
            className="h-10 w-full justify-between border border-[var(--input)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)] !px-3 py-2 text-base font-normal text-[var(--foreground)] sm:text-sm"
          >
            <span className="flex min-w-0 items-center gap-2 truncate text-[var(--foreground)]">
              <span className="truncate">{tz}</span>
              {currentOffset && (
                <span className="shrink-0 text-[var(--muted-foreground)]">
                  {currentOffset}
                </span>
              )}
            </span>
            {saving ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" />
            ) : (
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandInput placeholder={t("timezone.search")} />
            <CommandList>
              <CommandEmpty>{t("timezone.no_results")}</CommandEmpty>
              <CommandGroup>
                {zones.map(({ zone, offset }) => (
                  <CommandItem
                    key={zone}
                    value={zone}
                    onSelect={() => select(zone)}
                  >
                    <Check
                      className={[
                        "mr-2 h-4 w-4 shrink-0",
                        zone === tz ? "opacity-100" : "opacity-0",
                      ].join(" ")}
                    />
                    <span className="flex-1 truncate">{zone}</span>
                    {offset && (
                      <span className="ml-2 shrink-0 text-[var(--muted-foreground)]">
                        {offset}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
