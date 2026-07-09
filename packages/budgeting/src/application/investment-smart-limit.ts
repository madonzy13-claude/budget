/**
 * investment-smart-limit.ts — pure math for the Investments category's smart limit.
 *
 * Smart limit = monthly income (already FX-converted to budget ccy, summed by the
 * caller via sumWalletsToCurrency) − Σ planned of every OTHER active category,
 * clamped ≥ 0. Because a category only persists planned = needs + wants (not the
 * two halves), the spec's `income − Σwants − Σneeds` is exactly `income − Σplanned`.
 *
 * Money stays in bigint cents. Income amounts arrive as numeric(19,4) strings, so
 * decimalToCents parses them exactly (no float) with round-half-up to the cent.
 */
import {
  recurringMonthlyNormalize,
  type Cadence,
} from "./recurring-monthly-normalize";

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

/** income − Σ(other planned), never negative. */
export function computeInvestmentSmartLimit(input: {
  monthlyIncomeCents: bigint;
  otherPlannedCents: bigint;
}): bigint {
  const v = input.monthlyIncomeCents - input.otherPlannedCents;
  return v > 0n ? v : 0n;
}

export interface IncomeForNormalize {
  amount: string; // numeric(19,4) string
  currency: string;
  cadence: Cadence;
}

/**
 * Turn each income into a monthly-equivalent {amount_cents, currency} item (still
 * in its own currency) so the caller can FX-convert + sum via sumWalletsToCurrency.
 */
export function normalizeIncomesToMonthlyItems(
  incomes: IncomeForNormalize[],
): { amount_cents: bigint; currency: string }[] {
  return incomes.map((i) => ({
    amount_cents: recurringMonthlyNormalize(decimalToCents(i.amount), i.cadence),
    currency: i.currency,
  }));
}
