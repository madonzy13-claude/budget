/**
 * "Draft" is internal vocabulary. On screen it is an unconfirmed scheduled
 * payment.
 *
 * The user never created a draft — a scheduled payment came due and is waiting
 * on them. Calling it a draft asks them to learn a word for a thing they
 * already have a word for. The CODE keeps `draft_id`, `DraftRow`, CONFIRM_DRAFT
 * and the rest; only what a person reads changes, which is exactly the split
 * this test enforces: it reads message VALUES and ignores keys.
 */
import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

const LOCALES = [
  ["en", en],
  ["pl", pl],
  ["uk", uk],
] as const;

/** The word for "draft" in each locale, stemmed to catch every inflection —
 *  PL szkic/szkice/szkiców plus the periphrastic "wersja robocza", UK
 *  чернетка/чернетки/чернеткою/чернетковий. */
const DRAFT_WORD: Record<string, RegExp> = {
  en: /\bdrafts?\b/i,
  pl: /szkic|wersj\w*\s+robocz/i,
  uk: /чернет/i,
};

/** Every (path, value) leaf in a message file. */
function leaves(obj: unknown, path: string[] = []): Array<[string, string]> {
  if (typeof obj === "string") return [[path.join("."), obj]];
  if (obj && typeof obj === "object") {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, [...path, k]),
    );
  }
  return [];
}

describe("user-facing copy never says 'draft'", () => {
  for (const [locale, dict] of LOCALES) {
    it(`${locale} messages use the scheduled-payment wording`, () => {
      const offenders = leaves(dict)
        .filter(([, value]) => DRAFT_WORD[locale].test(value))
        // Report path AND text so a failure names the string to rewrite
        // rather than just a count.
        .map(([path, value]) => `${path} :: ${value}`);
      expect(offenders).toEqual([]);
    });
  }
});
