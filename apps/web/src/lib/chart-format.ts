/**
 * chart-format.ts — number formatting for CHART axes/tooltips (round 23/24).
 *
 * Charts show a bare, COMPACT number — no currency symbol (item 5) and short
 * magnitudes (1K / 10K / 100K / 1M) to save axis width (item 7). Input is CENTS
 * (charts pass Number cents), so divide by 100 for units. The grow/overspent TEXT
 * figures keep their currency symbol — this is only for the plotted axes/tooltips.
 */
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function chartCompactCents(n: number): string {
  return compact.format(n / 100);
}

/**
 * Percent axis tick with ADAPTIVE precision (r30b). A single small bar (~0.9%)
 * auto-domains to [0, 0.9]; a plain `Math.round(n)%` formatter then collapsed every
 * tick to "0%"/"1%" — a wall of identical labels. Under 10% we keep one decimal so
 * fractional ticks stay distinct (0.2% / 0.5% / 0.7% / 0.9%); at ≥10% whole numbers
 * are already far enough apart (10%, 906%). Trailing ".0" is dropped.
 */
export function pctAxisTick(n: number): string {
  const rounded = Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return `${rounded}%`;
}

/**
 * A single-day line series renders as a lone dot (no segment to draw). Prepend a
 * flat baseline at the PREVIOUS day so a LINE draws from day-start to the dot
 * (round 24 item 9). No-op for ≥2 points or an unparseable date label.
 *
 * `zeroKeys` resets those value keys to 0 at the baseline — e.g. cumulative
 * "real" spend starts the day at 0 while the "planned" target holds flat
 * (round 25 item 4).
 */
export function withDayStartBaseline<T extends { label: string }>(
  rows: T[],
  zeroKeys: string[] = [],
  always = false,
): T[] {
  if (rows.length === 0) return rows;
  // Default: only the degenerate single-point (lone dot) case. `always` = a
  // CUMULATIVE series (daily spend) that must ramp from 0 at the period start,
  // not from the first day's total (r31e) — prepend the baseline for any length.
  if (rows.length !== 1 && !always) return rows;
  const first = rows[0]!;
  const t0 = Date.parse(first.label);
  if (Number.isNaN(t0)) return rows;
  const prev = new Date(t0 - 86_400_000).toISOString().slice(0, 10);
  const baseline = { ...first, label: prev };
  for (const k of zeroKeys) (baseline as Record<string, unknown>)[k] = 0;
  return [baseline, ...rows];
}
