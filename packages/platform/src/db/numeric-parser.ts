import { types } from "pg";

/**
 * Pitfall 2: pg returns NUMERIC (OID 1700) as string AND BIGINT (OID 20) as string.
 * - We KEEP NUMERIC as string (Money.fromDb consumes string for big.js precision).
 * - We CAST BIGINT to bigint (callers expect a numeric primitive type).
 * Idempotent — safe to call multiple times.
 */
export function configureNumericParsers(): void {
  types.setTypeParser(20, (v: string) => BigInt(v));
  // OID 1700 (NUMERIC): leave default string parser
}
