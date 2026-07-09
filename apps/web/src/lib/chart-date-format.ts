/**
 * chart-date-format.ts — turn an ISO chart label into a short, readable,
 * locale-aware date (UAT round 16 item 5). "2026-02-12" → "12 Feb 2026";
 * "2026-02" (monthly bucket) → "Feb 2026". Non-date labels pass through.
 *
 * Day-month-year order (not the ISO string) so the axis reads naturally; the
 * month name is localized (Intl) so PL/UK get "лют"/"lut" etc.
 */
export function formatChartDate(
  label: string | number,
  locale: string,
): string {
  if (typeof label !== "string") return String(label);
  // Also accepts an hourly bucket "YYYY-MM-DDTHH" (the 1D wealth view).
  const m = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T(\d{2}))?)?$/.exec(label);
  if (!m) return label;
  const [, y, mo, d, h] = m;
  const date = new Date(
    Date.UTC(Number(y), Number(mo) - 1, d ? Number(d) : 1, h ? Number(h) : 0),
  );
  const monthShort = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  }).format(date);
  if (h) {
    // 1h / 12h bucket → "1 Jul 17:00" (UTC hour + date; the date disambiguates the
    // same hour across days on the multi-day 1M/3M wealth ranges).
    return `${Number(d)} ${monthShort} ${h}:00`;
  }
  return d ? `${Number(d)} ${monthShort} ${y}` : `${monthShort} ${y}`;
}
