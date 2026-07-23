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

/**
 * After removing the item at `removedIdx` from a nav list, the index (into the
 * NEW, post-removal list of length `newLen`) that should take the highlight —
 * the item that slid into the deleted slot (the next sibling), clamped to the
 * last item when the deleted one was last. -1 when the list is now empty.
 * (260723-5: focus the next wallet in the section, or its add button when the
 * section's last wallet was removed — the add button follows the wallets in the
 * flat nav order, so it naturally lands on it.)
 */
export function nextHighlightIndex(removedIdx: number, newLen: number): number {
  if (newLen <= 0) return -1;
  return Math.min(Math.max(removedIdx, 0), newLen - 1);
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
