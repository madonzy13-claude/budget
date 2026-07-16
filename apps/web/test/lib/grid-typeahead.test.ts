/**
 * grid-typeahead.test.ts — type-ahead category jump for the spendings grid.
 *
 * Reproduces the user's worked example verbatim (categories groceries / housing
 * / food & home). Matching is word-prefix (case-insensitive): the sequence is a
 * prefix of ANY whitespace-delimited word in the category name — so "ho" matches
 * both "housing" and the "home" word of "food & home", while "g" matches only
 * "groceries" (housing's single word starts with "h"). When the growing sequence
 * matches nothing, the new char restarts the sequence.
 */
import { describe, it, expect } from "vitest";
import { typeaheadStep } from "../../src/lib/grid-typeahead";

const NAMES = ["groceries", "housing", "food & home"];

/** Feed a string char-by-char, returning the final {buffer, jumpTo}. */
function feed(chars: string, start = "") {
  let buffer = start;
  let jumpTo: string | null = null;
  for (const ch of chars) {
    ({ buffer, jumpTo } = typeaheadStep(buffer, ch, NAMES));
  }
  return { buffer, jumpTo };
}

describe("typeaheadStep — the worked example", () => {
  it('"ho" is ambiguous (housing + food & home) → no jump', () => {
    expect(feed("ho").jumpTo).toBeNull();
  });

  it('"hom" uniquely identifies "food & home"', () => {
    expect(feed("hom").jumpTo).toBe("food & home");
  });

  it('"homi" matches nothing and does not jump (stays)', () => {
    const r = feed("homi");
    expect(r.jumpTo).toBeNull();
    expect(r.buffer).toBe("i"); // sequence restarted from the last char
  });

  it('"homig" restarts on "g" and jumps to "groceries"', () => {
    const r = feed("homig");
    expect(r.jumpTo).toBe("groceries");
    expect(r.buffer).toBe("g");
  });

  it('"homigh" restarts on "h" — ambiguous again, no jump', () => {
    const r = feed("homigh");
    expect(r.jumpTo).toBeNull();
    expect(r.buffer).toBe("h");
  });

  it('"homighou" ends uniquely on "hou" → "housing"', () => {
    expect(feed("homighou").jumpTo).toBe("housing");
  });
});

describe("typeaheadStep — units", () => {
  it("keeps extending while the longer sequence still matches ≥1", () => {
    // h(2) → ho(2) → hom(1) — buffer grows, only jumps at the unique step.
    let s = typeaheadStep("", "h", NAMES);
    expect(s).toEqual({ buffer: "h", jumpTo: null });
    s = typeaheadStep(s.buffer, "o", NAMES);
    expect(s).toEqual({ buffer: "ho", jumpTo: null });
    s = typeaheadStep(s.buffer, "m", NAMES);
    expect(s).toEqual({ buffer: "hom", jumpTo: "food & home" });
  });

  it("is case-insensitive", () => {
    expect(typeaheadStep("", "G", NAMES).jumpTo).toBe("groceries");
  });

  it("matches a non-first word (word-prefix, not name-prefix)", () => {
    // "home" is the 3rd word of "food & home"; a name-prefix rule would miss it.
    expect(typeaheadStep("ho", "m", NAMES).jumpTo).toBe("food & home");
  });

  it("does NOT match a word's interior or suffix", () => {
    // "g" must not match "housing" (ends in g) — only word-starts count.
    const s = typeaheadStep("", "g", NAMES);
    expect(s.jumpTo).toBe("groceries");
  });

  it("a char that matches nothing restarts the buffer and does not jump", () => {
    expect(typeaheadStep("groc", "z", NAMES)).toEqual({
      buffer: "z",
      jumpTo: null,
    });
  });
});
