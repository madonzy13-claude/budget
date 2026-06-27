/**
 * format-date.ts — Locale-aware date formatter using Intl.DateTimeFormat.
 *
 * Accepts an ISO date string (YYYY-MM-DD) and a BCP 47 locale tag,
 * returns a human-readable medium-length date string for the given locale.
 *
 * Uses Intl.DateTimeFormat (not moment/dayjs) per project conventions (I18N-04).
 * The Temporal polyfill is used for parsing; Intl.DateTimeFormat handles
 * locale-specific output.
 *
 * I18N-04 audit: dates must NOT use toLocaleDateString() with hardcoded
 * options — use this helper so locale is always explicit.
 */

/**
 * Format a YYYY-MM-DD date string for a given locale.
 * Returns a medium-length localized date (e.g. "Mar 15, 2024" for en).
 */
export function formatBudgetDate(isoDate: string, locale: string): string {
  // Parse YYYY-MM-DD parts — avoids timezone shifts from new Date(isoDate)
  const [year, month, day] = isoDate.split("-").map(Number);
  // Use UTC date to prevent timezone-based date shifting
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Format a Date or timestamp for a given locale with time.
 * Returns a short localized date+time string.
 */
export function formatBudgetDateTime(
  date: Date | number,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof date === "number" ? new Date(date) : date);
}

/**
 * Format an INSTANT (a real point in time — e.g. a session's last-active) in the
 * user's timezone, localized and human-readable: "13 February 2026, 10:44" (24h).
 *
 * Unlike formatBudgetDate (which renders a date-only calendar day, UTC-pinned),
 * this is for timestamps that genuinely live on the clock, so the timeZone matters.
 * Pass the user's IANA zone (e.g. "Europe/Warsaw"); omit to use the runtime zone.
 * Returns "" for an unparseable value so callers can render a graceful blank.
 */
export function formatTimestamp(
  value: Date | number | string,
  locale: string,
  timeZone?: string,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
