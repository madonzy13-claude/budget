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
  const widest = (xs: string[]) => Math.max(4, ...xs.map((x) => x.length));
  const group: Record<string, number> = {};
  for (const [name, amounts] of Object.entries(groups))
    group[name] = widest(amounts);
  return { top: widest(top), group };
}
