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
