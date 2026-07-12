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

/**
 * Currencies whose short sign conventionally FOLLOWS the amount ("916 zł",
 * "916 kr", "916 Kč") rather than preceding it. Everything else keeps the sign in
 * front ($916, €916, £916). Only applies to the narrow-sign path; the ISO-code
 * fallback stays a prefix. Extend as needed.
 */
const SUFFIX_SIGN_CURRENCIES = new Set([
  "PLN", // zł
  "CZK", // Kč
  "HUF", // Ft
  "SEK", // kr
  "NOK", // kr
  "DKK", // kr
  "ISK", // kr
  "RON", // lei
  "BGN", // лв
  "HRK", // kn
  "UAH", // ₴
]);

/**
 * Format `num` as `currency` with EN grouping. `narrow` picks the short sign
 * (zł/₴/$) over the ISO code; for suffix-convention currencies the short sign is
 * moved AFTER the number ("916 zł") — otherwise Intl's `en` locale always prefixes.
 */
function formatCurrency(
  num: number,
  currency: string,
  locale: string,
  narrow: boolean,
  opts: Intl.NumberFormatOptions,
): string {
  const nf = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: narrow ? "narrowSymbol" : "symbol",
    ...opts,
  });
  if (!narrow || !SUFFIX_SIGN_CURRENCIES.has(currency)) return nf.format(num);
  const parts = nf.formatToParts(num);
  const sign = parts.find((p) => p.type === "currency")?.value ?? "";
  const rest = parts
    .filter((p) => p.type !== "currency")
    .map((p) => p.value)
    .join("")
    .trim();
  return `${rest} ${sign}`;
}

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
  // narrow=true → the shortest currency sign ("kr", "zł", "₴") instead of the
  // ISO code Intl falls back to for many currencies ("SEK 700" → "kr 700").
  narrow = false,
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
  return formatCurrency(neg ? -num : num, currency, locale, narrow, {
    minimumFractionDigits: hasFrac ? 2 : 0,
    maximumFractionDigits: 2,
  });
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

/**
 * Currency rounded to whole units (no cents) — for hero/summary numbers that
 * can be large (millions); cents add width without value. Currency symbol,
 * bigint-safe, rounds half-up on the cents (`$17.50 → $18`). Distinct from
 * `centsToDisplayCompact`, which keeps non-zero fractions. Lives here (not in a
 * component) so every currency formatter stays in this one file — see
 * money-format-guard.test.ts.
 */
export function centsToRounded(
  cents: string | bigint,
  currency: string,
  locale = "en",
  // narrow=true → the shortest currency sign ("zł", "₴", "$") instead of the ISO
  // code Intl falls back to for many currencies in `en` ("PLN" → "zł").
  narrow = false,
): string {
  let big: bigint;
  try {
    big = typeof cents === "string" ? BigInt(cents) : cents;
  } catch {
    big = 0n;
  }
  const neg = big < 0n;
  const abs = neg ? -big : big;
  let units = abs / 100n;
  if (abs % 100n >= 50n) units += 1n;
  return formatCurrency(Number(neg ? -units : units), currency, locale, narrow, {
    maximumFractionDigits: 0,
  });
}
