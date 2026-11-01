/**
 * relative-ago.ts — R6 (user): "5 minutes ago" in the viewer's language, from
 * the standard Intl.RelativeTimeFormat (no next-intl hook, so it works in any
 * component). `short` is the tight form shown under an amount ("5m ago",
 * "5 хв тому", "2 tyg. temu"). Under a minute → null: the caller says
 * "just now".
 */
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

export function relativeAgo(
  at: Date,
  now: Date,
  locale: string,
  short = false,
): string | null {
  const ms = now.getTime() - at.getTime();
  if (ms < 60_000) return null;
  const rtf = new Intl.RelativeTimeFormat(
    locale,
    short ? { style: "narrow", numeric: "always" } : { numeric: "auto" },
  );
  for (const [unit, size] of UNITS) {
    if (unit === "week" && !short) continue;
    if (ms >= size) return rtf.format(-Math.floor(ms / size), unit);
  }
  return null;
}
