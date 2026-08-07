/**
 * share-bar.ts — proportional widths for a stacked share bar (260804).
 *
 * Two Overview strips became bars: the spend breakdown (what the limit covered,
 * what the reserve covered, what was overspent) and the reserve fit (needed
 * against held). Figures in a row said the same thing, but a bar says it at a
 * glance — you see a sliver of red without reading a number.
 *
 * A segment that HAS money in it never renders thinner than MIN_SEGMENT_PCT, or
 * a 0.2% overspend becomes a line nobody can hover; the space is taken from the
 * larger segments in proportion, so the bar still fills exactly 100%. A segment
 * with nothing in it is drawn not at all — zero is not a sliver.
 */
export const MIN_SEGMENT_PCT = 4;

export function shareBarWidths(values: readonly number[]): number[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total <= 0) return clean.map(() => 0);

  const raw = clean.map((v) => (100 * v) / total);
  const small = raw.map(
    (p, i) => p > 0 && p < MIN_SEGMENT_PCT && clean[i]! > 0,
  );
  const owed = raw.reduce(
    (acc, p, i) => acc + (small[i] ? MIN_SEGMENT_PCT - p : 0),
    0,
  );
  if (owed === 0) return raw;

  // Take the difference from the segments that can spare it, in proportion.
  const spareTotal = raw.reduce((acc, p, i) => acc + (small[i] ? 0 : p), 0);
  return raw.map((p, i) =>
    small[i]
      ? MIN_SEGMENT_PCT
      : p - (spareTotal > 0 ? (owed * p) / spareTotal : 0),
  );
}

/**
 * The piece's share of the whole, as a label (260805). Read from the MONEY, not
 * from the drawn width: a segment is never drawn thinner than MIN_SEGMENT_PCT,
 * so a 0.1% overspend would otherwise announce itself as 4%.
 *
 * A decimal only under 10%, where the difference between "0.1" and "0" is the
 * whole message; above that it is noise beside a rounded figure.
 */
export function shareLabel(value: number, total: number): string {
  if (!(total > 0) || !Number.isFinite(value)) return "";
  const pct = (100 * value) / total;
  return `${pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct)}%`;
}
