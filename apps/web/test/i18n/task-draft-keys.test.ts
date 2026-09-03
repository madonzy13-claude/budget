/**
 * The CONFIRM_DRAFT task names the scheduled payment, and neither draft-tab
 * message tells the reader to open the tab they are already looking at.
 *
 * Both are content contracts rather than key-presence ones, so they live here
 * with the other message-file tests: a translator can restore "Open the
 * Spendings tab" in one locale without touching a line of TypeScript, and
 * nothing else in the suite would notice.
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

/**
 * The "go to the Spendings tab" instruction in each locale. CONFIRM_DRAFT and
 * INCOME_UNDER_PLANNED are BOTH surfaced under the Spendings pill, so the
 * reader is already there in both cases.
 */
const OPEN_SPENDINGS: Record<string, string> = {
  en: "Open the Spendings tab",
  pl: "Otwórz zakładkę Wydatki",
  uk: "Відкрийте вкладку",
};

describe("CONFIRM_DRAFT task copy", () => {
  for (const [locale, dict] of LOCALES) {
    const tasks = (
      dict as { bdp: { tasks: Record<string, Record<string, string>> } }
    ).bdp.tasks;

    it(`${locale} title names the scheduled payment, not the category`, () => {
      const title = tasks.title.CONFIRM_DRAFT;
      // "Confirm 29.99 zł (Surfr)" — the payment name is what identifies the
      // draft on screen; its category is already the column it sits in.
      expect(title).toContain("{ruleName}");
      expect(title).not.toContain("{category}");
      expect(title).toContain("{amount}");
    });

    it(`${locale} title wraps the payment name in parentheses`, () => {
      // The parenthesised "{amount} ({ruleName})" run is the clickable target
      // in TaskBannerRow — the row splits the rendered title on exactly this
      // substring, so the shape is load-bearing, not cosmetic.
      expect(tasks.title.CONFIRM_DRAFT).toContain("{amount} ({ruleName})");
    });

    for (const key of ["CONFIRM_DRAFT", "INCOME_UNDER_PLANNED"]) {
      it(`${locale} ${key} detail does not say to open the Spendings tab`, () => {
        expect(tasks.detail[key]).not.toContain(OPEN_SPENDINGS[locale]);
      });
    }
  }
});
