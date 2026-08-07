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
export function monthsInRange(from: string, to: string): number {
  const parse = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    return Number.isFinite(y) && Number.isFinite(m) ? y! * 12 + m! : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return 1;
  return Math.max(1, b - a + 1);
}
