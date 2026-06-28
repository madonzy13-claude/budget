/**
 * overview-keys.test.ts — key-parity guard for the Budget Overview tab (SC9).
 *
 * The bdp.tab.overview.* strings were authored EN-first (11-08/09). next-intl
 * falls back to the key path (or EN) when a locale is missing a message, so a
 * forgotten PL/UK translation ships silently as English. This test fails CI if
 * the PL or UK key set under bdp.tab.overview ever drifts from EN.
 *
 * Mirrors the load pattern in icu-placeholder-escaping.test.ts.
 */
import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

/** All dotted leaf paths under an object (leaf = non-object value). */
function leafPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

const overview = (m: { bdp: { tab: { overview: unknown } } }) =>
  new Set(leafPaths(m.bdp.tab.overview));

describe("Overview i18n key parity (EN = PL = UK)", () => {
  const enKeys = overview(en as never);

  for (const [locale, messages] of [
    ["pl", pl],
    ["uk", uk],
  ] as const) {
    it(`${locale} has the exact same bdp.tab.overview keys as en`, () => {
      const keys = overview(messages as never);
      const missing = [...enKeys].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !enKeys.has(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });
  }
});
