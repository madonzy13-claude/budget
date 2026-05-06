import { ok, err, type Result } from '@budget/shared-kernel';
import type { Locale, LLMProviderName, STTProviderName } from '../contracts/api';

const ISO_4217 = /^[A-Z]{3}$/;
const LOCALES: ReadonlyArray<Locale> = ['en', 'pl', 'uk'];

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly emailVerified: boolean,
    public locale: Locale,
    public displayCurrency: string,
    public preferredLlm: LLMProviderName | null,
    public preferredStt: STTProviderName | null,
  ) {}

  changeLocale(next: Locale): Result<void, Error> {
    if (!LOCALES.includes(next)) return err(new Error(`Invalid locale: ${next}`));
    this.locale = next;
    return ok(undefined);
  }

  changeDisplayCurrency(next: string): Result<void, Error> {
    if (!ISO_4217.test(next)) return err(new Error(`Invalid ISO-4217: ${next}`));
    this.displayCurrency = next;
    return ok(undefined);
  }

  setProviderPrefs(prefs: { llm?: LLMProviderName | null; stt?: STTProviderName | null }): void {
    if (prefs.llm !== undefined) this.preferredLlm = prefs.llm;
    if (prefs.stt !== undefined) this.preferredStt = prefs.stt;
  }
}
