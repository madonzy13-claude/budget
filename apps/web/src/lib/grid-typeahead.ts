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

// Keyboard-layout transliteration (260722-translit). The user may search with a
// keyboard whose layout differs from the category's language — e.g. a Ukrainian
// keyboard active while the categories are English. We fold every char to its
// QWERTY physical-key position so a match is found regardless of the enabled
// layout, plus Polish diacritics to their base letter.
//
//  • Ukrainian KBDUR ↔ QWERTY: typing the physical keys f-o-o-d on the UA layout
//    emits "ащщв"; folding "ащщв" back to its key positions yields "food", which
//    matches the English "Food". Bidirectional — an English keyboard typing the
//    physical keys that would spell a UA name matches that name too.
//  • Polish ćśńżźółęą → csnzzolea, both directions (a diacritic fold).
//  • Ukrainian ґ folds to the same key as г (the two are interchangeable).
// prettier-ignore
const UA_TO_QWERTY: Record<string, string> = {
  й: "q", ц: "w", у: "e", к: "r", е: "t", н: "y", г: "u", ш: "i", щ: "o", з: "p", х: "[", ї: "]",
  ф: "a", і: "s", в: "d", а: "f", п: "g", р: "h", о: "j", л: "k", д: "l", ж: ";", є: "'",
  я: "z", ч: "x", с: "c", м: "v", и: "b", т: "n", ь: "m", б: ",", ю: ".",
  ґ: "u", // interchangeable with г
};
const PL_FOLD: Record<string, string> = {
  ć: "c",
  ś: "s",
  ń: "n",
  ż: "z",
  ź: "z",
  ó: "o",
  ł: "l",
  ę: "e",
  ą: "a",
};

/** Fold one char to its canonical search key (QWERTY position / base letter). */
function canonicalChar(ch: string): string {
  const c = ch.toLowerCase();
  if (c in UA_TO_QWERTY) return UA_TO_QWERTY[c]!;
  if (c in PL_FOLD) return PL_FOLD[c]!;
  // General Latin accent strip (é→e, ü→u…) for anything not covered above.
  return c.normalize("NFD").replace(/[\u0300-\u036f]/g, "") || c;
}

/** Fold a whole string for layout-agnostic type-ahead matching. */
export function canonicalizeForSearch(str: string): string {
  return Array.from(str, canonicalChar).join("");
}

/**
 * True when `seq` is a prefix of any whitespace word in `name`. Both are folded
 * through canonicalizeForSearch first, so matching is case-insensitive AND
 * keyboard-layout-agnostic (Cyrillic↔Latin by key position, Polish diacritics).
 */
function wordPrefixMatch(name: string, seq: string): boolean {
  const s = canonicalizeForSearch(seq);
  return canonicalizeForSearch(name)
    .split(/\s+/)
    .some((w) => w.startsWith(s));
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
  const candidate = buffer + c;
  const matches = names.filter((n) => wordPrefixMatch(n, candidate));
  if (matches.length >= 1) {
    // Still matching ≥1 → keep growing the sequence; jump only when unique.
    return {
      buffer: candidate,
      jumpTo: matches.length === 1 ? matches[0]! : null,
    };
  }
  // Dead end → look only at what was typed AFTER the last identification, i.e.
  // the SUFFIXES of the candidate, longest-first. Example: after "altruism" was
  // identified by "altr", typing "a" breaks it → try "tra" (→ travel), then
  // "ra", then "a". The first suffix that matches wins; jump if it's unique.
  for (let start = 1; start < candidate.length; start++) {
    const suffix = candidate.slice(start);
    const m = names.filter((n) => wordPrefixMatch(n, suffix));
    if (m.length >= 1) {
      return { buffer: suffix, jumpTo: m.length === 1 ? m[0]! : null };
    }
  }
  // Nothing matched, down to the single char → start fresh from it, no jump.
  return { buffer: c, jumpTo: null };
}
