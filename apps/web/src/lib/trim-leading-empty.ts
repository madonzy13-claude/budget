/**
 * trim-leading-empty.ts — where the "All" range starts (UAT round 15 item 1).
 *
 * "All" asks for five years back, so a budget with two years of history opens on
 * a long empty run. Drop those leading rows and the chart starts at the first
 * thing that actually happened.
 *
 * It has broken twice, both times invisibly until someone opened the tab: once
 * because the key list named a field the rows do not carry — `Number(undefined)`
 * is NaN, and NaN !== 0, so every row read as non-empty — and once because a
 * plan was drawn across months that had none. A key that is missing from every
 * row is ignored here rather than defeating the trim.
 */

/** Drop leading rows where every named key is absent or zero. */
export function trimLeadingEmpty<T extends Record<string, unknown>>(
  rows: T[],
  keys: string[],
): T[] {
  if (keys.length === 0) return rows;
  const has = (r: T, k: string) => {
    const n = Number(r[k]);
    return Number.isFinite(n) && n !== 0;
  };
  const first = rows.findIndex((r) => keys.some((k) => has(r, k)));
  return first > 0 ? rows.slice(first) : rows;
}
