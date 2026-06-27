/**
 * icu-placeholder-escaping.test.ts — guards against ICU single-quote escaping
 * silently swallowing a {placeholder}.
 *
 * Phase 10 UAT bug: the wallet-delete dialog showed the literal "Delete wallet
 * {name}?". Root cause was the en.json copy `Delete wallet '{name}'?` — in ICU
 * MessageFormat a single quote QUOTES the following braces, so `'{name}'` is
 * emitted verbatim instead of interpolated. (pl/uk correctly used doubled
 * quotes `''{name}''` → a literal apostrophe + the value.)
 *
 * The existing wallet-row component test could not catch this: it mocks
 * next-intl with a naive `string.replace("{name}", …)`, which does NOT run the
 * real ICU parser. This test formats the REAL message files through the SAME
 * engine next-intl uses in production (createTranslator).
 */
import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

const LOCALES = { en, pl, uk } as const;

/**
 * Each entry is a real message that wraps a {name} placeholder in literal
 * quotes. ICU treats a lone single quote as an escape, so the quoting MUST be a
 * doubled `''` (apostrophe literal) — never a single `'` — or the value is
 * swallowed. Add a row here whenever a quoted-placeholder string is introduced.
 */
const QUOTED_NAME_KEYS = [
  { ns: "bdp.tab.wallets.confirm.delete", key: "title" },
  { ns: "budgeting_categories.categories.toast", key: "created" },
] as const;

describe("ICU placeholder escaping — quoted {name} must interpolate", () => {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    for (const { ns, key } of QUOTED_NAME_KEYS) {
      it(`${locale}: ${ns}.${key} interpolates {name}`, () => {
        const t = createTranslator({ locale, messages, namespace: ns });
        const out = t(key, { name: "My Cash Wallet" });
        expect(out).toContain("My Cash Wallet");
        expect(out).not.toContain("{name}");
      });
    }
  }
});
