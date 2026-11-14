/**
 * An amount's width in `ch`: a digit or sign is one, a group or decimal
 * separator about half (261114 — counting it as a whole digit left the
 * currency ~14px off "12,345" instead of ~10px).
 */
export function amountChars(s: string): number {
  let w = 0;
  for (const c of s) w += /[\s,.\u00a0\u202f']/.test(c) ? 0.5 : 1;
  return w;
}

/**
 * Width, in characters, of the investments amount column. Top-level rows
 * (group headers + ungrouped holdings) share one width so their currency codes
 * line up; rows inside a group line up on that group's widest row, so a big
 * group total doesn't squeeze the names beneath it (user, 261023).
 */
export function amountColumnChars(
  top: string[],
  groups: Record<string, string[]>,
): { top: number; group: Record<string, number> } {
  const widest = (xs: string[]) => Math.max(4, ...xs.map(amountChars));
  const group: Record<string, number> = {};
  for (const [name, amounts] of Object.entries(groups))
    group[name] = widest(amounts);
  return { top: widest(top), group };
}
