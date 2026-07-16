/**
 * relative-time.ts — human-readable "how long ago" (r40, spendings footer).
 *
 * Recent past reads as relative time ("25 minutes ago", "yesterday" — via
 * Intl.RelativeTimeFormat numeric:"auto"); anything older than a week shows
 * the absolute date rendered in the USER's IANA timezone (identity setting),
 * so the day boundary is the user's, not the server's.
 */
export function formatRelativeOrDate(
  iso: string,
  locale: string,
  tz: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  const diffSec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffSec < 60) return rtf.format(-diffSec, "second");
  if (diffSec < 60 * 60) return rtf.format(-Math.round(diffSec / 60), "minute");
  if (diffSec < 24 * 60 * 60)
    return rtf.format(-Math.round(diffSec / 3600), "hour");
  if (diffSec < 7 * 24 * 60 * 60)
    return rtf.format(-Math.round(diffSec / 86400), "day");

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz,
  }).format(then);
}
