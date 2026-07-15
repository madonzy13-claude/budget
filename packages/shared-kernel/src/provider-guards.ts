// provider-guards.ts — trust-boundary guards for third-party numeric responses.
// A spoofed/buggy/compromised upstream (price, FX rate) can return NaN, Infinity,
// 0, negative, or an absurd value; these feed straight into Big() money math and
// cached net-worth. Adapters call these AT the boundary and re-throw their own
// error type (NoPriceAvailable / stale-fallback) so control flow is unchanged.

/** Largest plausible unit price / FX rate. Anything above is upstream garbage. */
export const SANE_NUMBER_CEILING = 1e12;

/** Cap for outbound JSON bodies from per-price / per-FX providers (memory-DoS guard). */
export const PRICE_BODY_CAP_BYTES = 1_000_000; // 1 MB

/**
 * Return `raw` unchanged iff it is a finite number, > 0, and <= SANE_NUMBER_CEILING;
 * otherwise throw. Callers wrap this in a try/catch that maps to their own error type,
 * so a valid number passes through byte-identical to `String(raw)` downstream.
 */
export function sanePositiveNumber(
  raw: number,
  ceiling = SANE_NUMBER_CEILING,
): number {
  if (!Number.isFinite(raw) || raw <= 0 || raw > ceiling) {
    throw new Error(`insane provider number: ${raw}`);
  }
  return raw;
}

/**
 * Throw if the response declares a Content-Length over `cap`. ponytail: content-length
 * only — a lying/absent header isn't caught here; stream-limit is the upgrade path if a
 * provider is ever untrusted enough to warrant it. Cheap, correct for honest upstreams.
 */
export function assertBodyUnderCap(
  res: { headers?: { get(name: string): string | null } | null },
  cap: number,
): void {
  // Missing headers (or header) = unknown length → allow; a real Response always
  // has headers, this only tolerates minimal test doubles.
  const len = res.headers?.get("content-length");
  if (len != null && Number(len) > cap) {
    throw new Error(`response body ${len} bytes exceeds cap ${cap}`);
  }
}
