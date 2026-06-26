import { ok, err, type Result } from "@budget/shared-kernel";
import type { Locale } from "../contracts/api";

const ISO_4217 = /^[A-Z]{3}$/;
const LOCALES: ReadonlyArray<Locale> = ["en", "pl", "uk"];

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly emailVerified: boolean,
    public locale: Locale,
    public displayCurrency: string,
  ) {}

  changeLocale(next: Locale): Result<void, Error> {
    if (!LOCALES.includes(next))
      return err(new Error(`Invalid locale: ${next}`));
    this.locale = next;
    return ok(undefined);
  }

  changeDisplayCurrency(next: string): Result<void, Error> {
    if (!ISO_4217.test(next))
      return err(new Error(`Invalid ISO-4217: ${next}`));
    this.displayCurrency = next;
    return ok(undefined);
  }
}
