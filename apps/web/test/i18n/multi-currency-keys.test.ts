/**
 * Phase 14 copy (UI-SPEC Copywriting Contract): every multi-currency key exists
 * in en/pl/uk with the exact agreed wording.
 */
import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

const at = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

const COPY: Record<string, [string, string, string]> = {
  "settings.identity.currency_confirm_title": [
    "Change budget currency to {currency}?",
    "Zmienić walutę budżetu na {currency}?",
    "Змінити валюту бюджету на {currency}?",
  ],
  "settings.identity.currency_confirm_body": [
    "Every total will be shown in {currency}, converted at the rate of each date. Transactions keep the currency they were entered in.",
    "Wszystkie sumy będą pokazane w {currency}, przeliczone po kursie z danego dnia. Transakcje zachowują walutę, w której zostały wpisane.",
    "Усі суми буде показано в {currency}, перераховані за курсом відповідного дня. Транзакції зберігають валюту, у якій їх було введено.",
  ],
  "settings.identity.currency_confirm_cta": ["Change currency", "Zmień walutę", "Змінити валюту"],
  "settings.identity.currency_confirm_cancel": [
    "Keep {currentCurrency}",
    "Zostaw {currentCurrency}",
    "Залишити {currentCurrency}",
  ],
  // Shortened: the "Transactions keep their own" half went (user, 261103).
  "settings.identity.currency_hint": [
    "Totals are shown in this currency.",
    "Sumy są pokazywane w tej walucie.",
    "Підсумки показуються в цій валюті.",
  ],
  "grid.categoryCurrency.label": ["Currency", "Waluta", "Валюта"],
  // A refused save says what happened (owner, 261104).
  "grid.error.saveFailed": [
    "Couldn't save the category: {reason}. Please try again later, or report it if it keeps happening.",
    "Nie udało się zapisać kategorii: {reason}. Spróbuj ponownie później lub zgłoś to, jeśli będzie się powtarzać.",
    "Не вдалося зберегти категорію: {reason}. Спробуйте пізніше або повідомте про це, якщо повторюється.",
  ],
  "grid.categoryCurrency.rateError": [
    "No exchange rate for {pair} yet. Try again later.",
    "Brak kursu dla {pair}. Spróbuj później.",
    "Немає курсу для {pair}. Спробуйте пізніше.",
  ],
  "grid.limitEquivalent": ["≈ {amount}", "≈ {amount}", "≈ {amount}"],
  "bdp.tasks.title.RESERVE_TOPUP_withdraw": [
    "Reserve has {amount} extra",
    "W rezerwie jest {amount} za dużo",
    "У резерві зайвих {amount}",
  ],
};

describe("Multi-currency copy", () => {
  for (const [key, [e, p, u]] of Object.entries(COPY)) {
    it(`${key} reads the agreed wording in every locale`, () => {
      expect(at(en, key)).toBe(e);
      expect(at(pl, key)).toBe(p);
      expect(at(uk, key)).toBe(u);
    });
  }

  it("never says draft", () => {
    for (const locale of [en, pl, uk]) {
      for (const key of Object.keys(COPY)) {
        expect(String(at(locale, key))).not.toMatch(/draft|szkic|чернетк/i);
      }
    }
  });

  it("the lock-era copy is gone (Phase 14 removed its readers)", () => {
    for (const locale of [en, pl, uk]) {
      expect(at(locale, "settings.identity.currency_locked_tooltip")).toBeUndefined();
      // No "Limit converts at today's rate…" line (owner, 261104).
      expect(at(locale, "grid.categoryCurrency.changeHint")).toBeUndefined();
      expect(at(locale, "bdp.tab.wallets.row.currencyReadOnlyAria")).toBeUndefined();
    }
  });
});
