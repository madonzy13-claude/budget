/**
 * grid-typeahead.ts — type-ahead category jump for the spendings grid (r40b).
 *
 * As the user types letters, jump to the category whose name the sequence can
 * UNIQUELY identify, and focus that column's quick-add field. Matching is
 * word-prefix, case-insensitive: the sequence must be a prefix of some
 * whitespace-delimited word in the name. So "ho" matches "housing" AND the
 * "home" word of "food & home" (ambiguous → no jump), while "g" matches only
 * "groceries" (housing's one word starts with "h").
 *
 * The sequence GROWS while the extended candidate still matches ≥1 category, and
 * RESTARTS from the newest char the moment the candidate matches nothing — so a
 * wrong letter begins a fresh sequence rather than dead-ending. A jump fires
 * only when exactly one category matches; otherwise focus stays put. The 5s
 * idle-reset is the caller's concern (it owns the clock).
 *
 * Pure helper so it unit-tests without a DOM or timers.
 */

/** True when `seq` is a prefix of any whitespace word in `name` (both lowered). */
function wordPrefixMatch(name: string, seq: string): boolean {
  return name
    .toLowerCase()
    .split(/\s+/)
    .some((w) => w.startsWith(seq));
}

export interface TypeaheadResult {
  /** The new buffer to carry into the next keystroke. */
  buffer: string;
  /** Category name to jump to (focus its quick input), or null to stay put. */
  jumpTo: string | null;
}

/**
 * Advance the type-ahead by one character.
 * @param buffer  the running sequence from prior keystrokes ("" to start)
 * @param char    the just-pressed character (single letter; case-insensitive)
 * @param names   the visible category names (original case; returned verbatim)
 */
export function typeaheadStep(
  buffer: string,
  char: string,
  names: string[],
): TypeaheadResult {
  const c = char.toLowerCase();
  let seq = buffer + c;
  let matches = names.filter((n) => wordPrefixMatch(n, seq));
  if (matches.length === 0) {
    // The extended candidate is a dead end → restart the sequence from `char`.
    seq = c;
    matches = names.filter((n) => wordPrefixMatch(n, seq));
  }
  return { buffer: seq, jumpTo: matches.length === 1 ? matches[0]! : null };
}
