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
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, d ? Number(d) : 1));
  const monthShort = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  }).format(date);
  // Hourly buckets (1M/3M wealth view) collapse to their DATE — no time (the
  // axis + tooltip show only the date). Sparse ticks mean same-day hours share a
  // label, which is fine.
  return d ? `${Number(d)} ${monthShort} ${y}` : `${monthShort} ${y}`;
}
