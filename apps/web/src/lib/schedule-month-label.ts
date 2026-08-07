/**
 * schedule-month-label.ts — "YYYY-MM" → something a person reads.
 *
 * The upcoming-payments chart used to be a calendar year, so a bare month name
 * was unambiguous. It now runs from today to the furthest thing scheduled
 * (260807), which can be two years out — and two Septembers under the same word
 * is a chart that lies quietly. Both formats carry the year.
 *
 * Month and year go through ONE Intl call so inflected locales (uk, pl) get the
 * form they need rather than a nominative month glued to a number.
 */
const parse = (month: string): Date | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return new Date(Date.UTC(year, monthIndex, 1));
};

/** Tooltip / label form: "September 2026". */
export function scheduleMonthLabel(month: string, locale: string): string {
  const d = parse(month);
  if (!d) return month;
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Axis form: short enough to repeat under every bar — "Sep 26". */
export function scheduleMonthTick(month: string, locale: string): string {
  const d = parse(month);
  if (!d) return month;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(d);
}
