/**
 * investment-smart-limit.ts — income helpers: exact decimal → cents and the
 * monthly-equivalent of each income (still in its own currency). The name is
 * historical: the smart Investments limit these once fed is gone (15-18).
 *
 * Money stays in bigint cents. Income amounts arrive as numeric(19,4) strings, so
 * decimalToCents parses them exactly (no float) with round-half-up to the cent.
 */
import {
  scheduledMonthlyNormalize,
  type Cadence,
} from "./scheduled-monthly-normalize";

/** Exact decimal-string → integer cents, round-half-up. No float (money path). */
export function decimalToCents(amount: string): bigint {
  const neg = amount.startsWith("-");
  const s = neg ? amount.slice(1) : amount;
  const [intPart, fracPartRaw = ""] = s.split(".");
  const frac = fracPartRaw.padEnd(3, "0"); // need 3 digits to round the cent
  const whole = BigInt(intPart || "0") * 100n;
  const centDigits = BigInt(frac.slice(0, 2));
  const roundDigit = frac.charCodeAt(2) - 48; // 3rd fractional digit
  const cents = whole + centDigits + (roundDigit >= 5 ? 1n : 0n);
  return neg ? -cents : cents;
}

export interface IncomeForNormalize {
  amount: string; // numeric(19,4) string
  currency: string;
  cadence: Cadence | "ONCE";
  /** The day a ONE-TIME income arrives (mig 0080). Ignored for the rhythms. */
  once_date?: string | null;
}

/**
 * Turn each income into a monthly-equivalent {amount_cents, currency} item (still
 * in its own currency) so the caller can FX-convert + sum via sumWalletsToCurrency.
 *
 * `month` ('YYYY-MM') is what a ONE-TIME income is judged against: it counts in
 * full in the month it arrives and for nothing in any other — not a twelfth,
 * not an average. A caller that cannot say which month it means gets zero for
 * those incomes rather than a figure that is only true once a year (260807).
 */
export function normalizeIncomesToMonthlyItems(
  incomes: IncomeForNormalize[],
  month?: string,
): { amount_cents: bigint; currency: string }[] {
  return incomes.map((i) => ({
    amount_cents:
      i.cadence === "ONCE"
        ? month && i.once_date?.slice(0, 7) === month
          ? decimalToCents(i.amount)
          : 0n
        : scheduledMonthlyNormalize(decimalToCents(i.amount), i.cadence),
    currency: i.currency,
  }));
}
