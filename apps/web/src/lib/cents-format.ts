/**
 * cents-format.ts — BigInt-safe currency formatter.
 *
 * Converts serialized bigint cents (from Postgres BIGINT → JSON string) to a
 * locale-formatted currency string using Intl.NumberFormat.
 *
 * Handles: negative balances (overspent), zero, large values.
 * BigInt arithmetic avoids float precision loss on amounts > Number.MAX_SAFE_INTEGER.
 *
 * Source: RESEARCH §Pitfall 4 + interfaces spec.
 */

export function centsToDisplay(
  cents: string | bigint,
  currency: string,
  locale = "en",
): string {
  const big = typeof cents === "string" ? BigInt(cents) : cents;
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  const num = `${whole.toString()}.${frac}`;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(neg ? -Number(num) : Number(num));
}

/**
 * Currency formatter with conditional fraction digits — drops a `.00`
 * fraction (`2000` EUR → `€20`) but pads any non-zero fraction to two digits
 * (`1750` EUR → `€17.50`). Matches the bare-amount rule used by
 * `centsToBare` in the spendings grid, but keeps the currency symbol so the
 * value is unambiguous on surfaces that aren't already scoped to a single
 * currency (task slider rows, "More" dialog, summaries, etc.).
 *
 * BigInt-safe — same as `centsToDisplay`.
 */
export function centsToDisplayCompact(
  cents: string | bigint,
  currency: string,
  locale = "en",
): string {
  let big: bigint;
  try {
    big = typeof cents === "string" ? BigInt(cents) : cents;
  } catch {
    big = 0n;
  }
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const hasFrac = frac !== 0n;
  const num = Number(`${whole.toString()}.${frac.toString().padStart(2, "0")}`);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: hasFrac ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(neg ? -num : num);
}

/**
 * Bare amount formatter — no currency symbol. Drops a `.00` fraction
 * (`50000` → `500`) but pads any non-zero fraction to two digits
 * (`320` → `3.20`, `10` → `0.10`). Negative amounts get a leading minus.
 */
export function centsToBare(cents: string | bigint, locale = "en"): string {
  // UAT-PH5-T3-29: optimistic mutations can briefly set this to "NaN" when
  // the user enters a non-numeric amount (e.g. "123,45" before locale
  // normalisation lands). BigInt("NaN") throws SyntaxError mid-render and
  // crashes the page. Coerce to 0 instead so the row stays visible while
  // the server rejects the bad value with a 422 and the rollback fires.
  let big: bigint;
  try {
    big = typeof cents === "string" ? BigInt(cents) : cents;
  } catch {
    big = 0n;
  }
  const neg = big < 0n;
  const abs = neg ? -big : big;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const hasFrac = frac !== 0n;
  const num = Number(`${whole.toString()}.${frac.toString().padStart(2, "0")}`);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasFrac ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
  return neg ? `-${formatted}` : formatted;
}
