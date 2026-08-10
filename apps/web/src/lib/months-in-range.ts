/**
 * months-in-range.ts — how many months a selected range covers (260805).
 *
 * The Overview's totals are sums over the whole range; the figure beside each of
 * them says what that comes to in a month, which needs a divisor.
 *
 * Calendar months TOUCHED, not elapsed 30-day blocks: 1–5 February is one
 * month's worth of spending however few days it is, and dividing it by 0.16 of a
 * month would invent an average nobody ever spent.
 */
export function monthsInRange(
  from: string,
  to: string,
  /** Today, in the member's zone. The month it falls in is only as long as the
   *  days it has actually had: its spend is ten days old and its plan is
   *  pro-rated to ten days, so counting it whole dragged both monthly figures
   *  down by the twenty-one days that have not happened yet (user, 260810).
   *  Omitted → every month counts whole, as it did before. */
  todayIso?: string,
): number {
  const parse = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    return Number.isFinite(y) && Number.isFinite(m) ? y! * 12 + m! : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return 1;
  const whole = b - a + 1;
  if (whole <= 0) return 1;

  const today = todayIso ? parse(todayIso) : null;
  // Only when the month still running is INSIDE the range does it stand for
  // part of a month; a range that ended before today is finished history.
  if (today === null || today < a || today > b) return Math.max(1, whole);

  const [y, m, d] = todayIso!.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // The first of the month is still a day of spending, not nothing to divide by.
  const elapsed = Math.min(Math.max(d, 1), daysInMonth);
  return whole - 1 + elapsed / daysInMonth;
}
