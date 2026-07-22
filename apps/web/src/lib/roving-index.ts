/**
 * roving-index.ts — pure index math for the assets-tab roving keyboard highlight.
 *
 * Kept separate from the DOM wiring (use-asset-keyboard-nav) so the wrap-around
 * logic unit-tests without a browser.
 */

/** Wrap `i` into [0, len). */
export function wrapIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  return ((i % len) + len) % len;
}

/**
 * Next index when moving the highlight by `dir` (+1 down / -1 up), wrapping at
 * the ends. When nothing is highlighted yet (`cur` === -1), Down enters at the
 * top (0) and Up enters at the bottom (len-1).
 */
export function nextNavIndex(cur: number, len: number, dir: 1 | -1): number {
  if (len <= 0) return -1;
  if (cur < 0) return dir === 1 ? 0 : len - 1;
  return wrapIndex(cur + dir, len);
}

/** The three horizontally-hoppable fields of a wallet / possession row. */
export const NAV_FIELDS = ["name", "currency", "amount"] as const;
export type NavField = (typeof NAV_FIELDS)[number];

/** Next field index when hopping ←/→ within a row, wrapping. Starts at the first
 *  field (→ from none) or the last (← from none). */
export function nextFieldIndex(cur: number | null, dir: 1 | -1): number {
  const len = NAV_FIELDS.length;
  if (cur === null) return dir === 1 ? 0 : len - 1;
  return wrapIndex(cur + dir, len);
}
