/**
 * Direction of a P/L figure — up, down, or FLAT.
 *
 * Every readout used to branch on `delta >= 0`, which put an exact zero in the
 * gain branch: green, up-arrow, "+0.0%". Zero is not rare here — the wealth
 * series is carry-forward filled, so a day with no snapshot yet gives
 * `current − base === 0n` (dayCloseDelta), and a range with no movement gives
 * the same. Three states, one place, so the colour/arrow/sign can't disagree.
 */
export type PlTone = "up" | "down" | "flat";

export function plTone(
  delta: string | number | bigint | null | undefined,
): PlTone {
  if (delta === null || delta === undefined) return "flat";
  const n = Number(delta);
  if (!Number.isFinite(n) || n === 0) return "flat";
  return n > 0 ? "up" : "down";
}

/**
 * How many decimals a P/L percent needs to SHOW itself.
 *
 * One decimal printed Mój Budżet's +0.0071% night as "+0.0%": a green arrow
 * beside a figure reading zero (user, 260819). The move is real, so the answer
 * is precision, not muting — grow decimals until the first significant digit
 * appears ("0.007%"). Capped, or a rounding-error percent would print a wall of
 * zeroes.
 */
export function plPctDecimals(
  pct: number | null | undefined,
  max = 6,
): number {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 1;
  const abs = Math.abs(pct);
  if (abs === 0) return 1;
  if (Number(abs.toFixed(1)) !== 0) return 1;
  // First significant digit sits at the ceil(-log10) decimal place: 0.0071 →
  // 2.149 → 3 → "0.007". Rounding UP at that place is what keeps 0.049 → "0.05"
  // rather than "0.0".
  return Math.min(max, Math.ceil(-Math.log10(abs)));
}

export const PL_TONE_CLASS: Record<PlTone, string> = {
  up: "text-[var(--trading-up)]",
  down: "text-[var(--trading-down)]",
  flat: "text-[var(--muted-foreground)]",
};

/** Leading sign for a P/L string. Flat gets none — "0.0%", not "+0.0%". */
export function plSign(tone: PlTone, minus = "-"): string {
  return tone === "up" ? "+" : tone === "down" ? minus : "";
}
