/**
 * decimal.ts — locale-aware decimal input parser.
 *
 * Converts user-typed strings (accepting both "." and "," as decimal separator)
 * into integer cents. Returns null for invalid input.
 *
 * Security: T-04-03-01 — strips all non-digit/separator characters,
 * validates format before parsing. Never passes malformed values to
 * the optimistic cache.
 *
 * Source: RESEARCH §Pitfall 8 verbatim.
 */

export function parseDecimal(input: string): number | null {
  const cleaned = input
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, ".")
    .replace(/(\..*)\./g, "$1");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100); // returns cents
}

/**
 * The same typed amount as a canonical decimal STRING, or null when it is not a
 * positive amount. For the endpoints that take a decimal rather than cents — the
 * scheduled-payment routes validate `^\d+(\.\d{1,4})?$`, so a comma keyboard
 * ("73,8", the Polish layout's decimal key) was rejected and the save failed with
 * a bare "Failed to create rule" (user report, 260803).
 *
 * Four decimals, not two: that is what those endpoints store.
 */
export function toDecimalString(input: string): string | null {
  const cleaned = input
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, ".");
  // Two separators is not a number anyone meant. parseDecimal collapses them
  // ("1,2,3" → 1.23); on a money field that is a silent wrong amount, so this
  // refuses instead and the caller can say so.
  if ((cleaned.match(/\./g) ?? []).length > 1) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) return null;
  return parseFloat(cleaned) > 0 ? cleaned : null;
}

/**
 * Split a quick-entry string into an amount (cents) and an optional note
 * (260722-note). "11.45" / "11,45" → { cents: 1145, note: null }. The FIRST
 * whitespace ends the amount — everything after it becomes the note:
 * "11.45 lunch" → { cents: 1145, note: "lunch" }. Returns null when the amount
 * part is not a valid decimal.
 */
export function parseAmountAndNote(
  input: string,
): { cents: number; note: string | null } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const sp = trimmed.search(/\s/);
  const amountPart = sp === -1 ? trimmed : trimmed.slice(0, sp);
  const note = sp === -1 ? "" : trimmed.slice(sp + 1).trim();
  const cents = parseDecimal(amountPart);
  if (cents === null) return null;
  return { cents, note: note || null };
}
