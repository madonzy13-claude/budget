/**
 * The planned-spend pie is an AVERAGE per month, and its title has to say so.
 *
 * "Planned spendings, by category" read as a total for the range; the figures
 * under it are each category's average month. The word is the whole fix
 * (user, 260902).
 */
import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

const TITLES: Record<string, string> = {
  en: "Average planned spendings, by category",
  pl: "Średnie planowane wydatki wg kategorii",
  uk: "Середні заплановані витрати за категоріями",
};

describe("planned pie title", () => {
  for (const [locale, dict] of [
    ["en", en],
    ["pl", pl],
    ["uk", uk],
  ] as const) {
    it(`${locale} says the figures are an average`, () => {
      const t = (
        dict as {
          bdp: { tab: { overview: { planned: { avgPie: string } } } };
        }
      ).bdp.tab.overview.planned.avgPie;
      expect(t).toBe(TITLES[locale]);
    });
  }
});
