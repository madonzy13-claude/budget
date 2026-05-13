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
