"use client";

import { useLocale } from "next-intl";
import { Input } from "@/components/ui/input";

interface DateInputProps {
  value: string; // ISO YYYY-MM-DD
  onChange: (next: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  id?: string;
  /** Optional placeholder text shown when `value` is empty. */
  placeholder?: string;
}

/**
 * UAT round 17: native `<input type="date">` paints the value text and
 * picker icon using the browser's system locale. We hide that rendering
 * via the `.date-input-overlay-host` rules in global.css and overlay
 * a formatted span on top, so every date field across the app reads as
 * "13 Jul 2026" (`{day} {monthShort} {year}` in the active page locale).
 * The native input still receives clicks / focus / keyboard and opens
 * the dark calendar (color-scheme: dark) on every platform including
 * iOS Safari, where the earlier sr-only + showPicker() pattern failed.
 */
function formatDisplayDate(iso: string, locale: string): string {
  if (!iso) return "";
  const parts = iso.split("-").map((s) => parseInt(s, 10));
  const [y, m, d] = parts;
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    y === undefined ||
    m === undefined ||
    d === undefined
  ) {
    return "";
  }
  const date = new Date(y, m - 1, d);
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short" }).format(
    date,
  );
  // Strip the trailing dot some locales suffix (uk: "лип.", de: "Jul.")
  // so the rendered chip stays compact.
  const monthClean = monthShort.replace(/\.$/, "");
  return `${d} ${monthClean} ${y}`;
}

export function DateInput({
  value,
  onChange,
  placeholder,
  ...rest
}: DateInputProps) {
  const locale = useLocale();
  const display = formatDisplayDate(value, locale);
  return (
    <div className="relative date-input-overlay-host min-w-[7.5rem]">
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 text-transparent caret-transparent"
        {...rest}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center whitespace-nowrap px-3 text-base sm:text-sm text-[var(--body-on-dark)]"
      >
        {display ||
          (placeholder ? (
            <span className="text-[var(--muted-foreground)]">
              {placeholder}
            </span>
          ) : null)}
      </span>
    </div>
  );
}
