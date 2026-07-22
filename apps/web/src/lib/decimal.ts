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
