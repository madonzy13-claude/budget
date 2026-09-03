/**
 * rules.ts — the pure transforms the demo scrub manifest names.
 *
 * Money is scaled by ONE factor per budget pair. Scaling is linear, so a
 * scaled sum and a sum of scaled rows differ only by rounding — limits,
 * balances, category totals and FX conversions therefore stay consistent with
 * each other. A per-row random factor would destroy that, which is why the
 * factor is a property of the pair, never of the row.
 */

export type MoneyDecimals = 0 | 4;

/**
 * Sanity bounds for a CONFIGURED money factor.
 *
 * The factor used to be re-rolled nightly across this range, which made the
 * demo's capitalization swing by 60-90% between consecutive days — fine for a
 * screenshot, wrong for something people revisit. It is now a constant set per
 * budget in configuration; these bounds only stop a typo (a stray 100 or a
 * negative) from reaching a public login.
 *
 * A fixed factor is also the easiest of the schemes to invert if anyone ever
 * works out the constant — a deliberate trade, chosen for stability.
 */
export const SCALE_MIN = 0.01;
export const SCALE_MAX = 100;

/** True when a configured factor is usable at all. */
export function isUsableScale(v: number): boolean {
  return Number.isFinite(v) && v >= SCALE_MIN && v <= SCALE_MAX;
}

/** bigint for `*_cents` columns, string for `numeric(19,4)` (pg returns NUMERIC as string). */
export function scaleMoney(
  value: bigint | null,
  factor: number,
  decimals: 0,
): bigint | null;
export function scaleMoney(
  value: string | null,
  factor: number,
  decimals: 4,
): string | null;
export function scaleMoney(
  value: bigint | string | null,
  factor: number,
  decimals: MoneyDecimals,
): bigint | string | null {
  if (value === null || value === undefined) return null;

  if (decimals === 0) {
    const v = typeof value === "bigint" ? value : BigInt(value);
    // Round half away from zero, in integer space, so the sign is preserved
    // exactly (negative wallets are real — credit cards carry a negative
    // balance in this app).
    const scaled = Number(v) * factor;
    return BigInt(Math.round(scaled));
  }

  const n = typeof value === "string" ? Number(value) : Number(value);
  return (n * factor).toFixed(4);
}

/**
 * Applies the pair's currency map. An empty map is identity — that is how the
 * family demo budget keeps PLN while the personal one relabels PLN to USD.
 */
export function relabelCurrency(
  code: string | null,
  map: Record<string, string>,
): string | null {
  if (code === null || code === undefined) return null;
  const upper = code.toUpperCase();
  return map[upper] ?? upper;
}

export type { DemoLocale, PoolName } from "./pools";
export {
  poolValues,
  merchantsForCategory,
  categoryCount,
  demoLocales,
  isDemoLocale,
} from "./pools";

import {
  poolValues as poolValuesFor,
  type PoolName,
  type DemoLocale,
} from "./pools";

/**
 * Rounds a money amount to a value a human would have typed.
 *
 * Scaling by an arbitrary daily factor turns a tidy 3,000 limit into 231,209 —
 * technically consistent, and immediately reads as machine noise on a screen
 * meant to look like somebody's real budget. Limits are TARGETS, not sums, so
 * rounding them breaks no invariant: nothing has to add up to a limit.
 *
 * Deliberately NOT applied to transactions. Those DO sum into category totals
 * and balances, and rounding each one would make the totals disagree with the
 * rows behind them.
 *
 * Step grows with magnitude, the way people actually pick round numbers:
 * 12 → 12, 86 → 85, 312 → 310, 4,180 → 4,200, 231,209 → 231,000.
 *
 * The <100 band steps by 5, not 1: at a small daily factor the limits land in
 * double digits, and 86 / 71 / 69 read exactly as machine-generated as the
 * six-figure version did.
 */
export function niceRound(major: number): number {
  const abs = Math.abs(major);
  const step =
    abs < 20
      ? 1
      : abs < 100
        ? 5
        : abs < 1_000
          ? 10
          : abs < 10_000
            ? 50
            : abs < 100_000
              ? 500
              : 1_000;
  return Math.round(major / step) * step;
}

export type TextPool = PoolName;

/** Deterministic per (pool, seed) so a re-run of the same night is stable. */
export function fakeText(
  pool: PoolName,
  seed: number,
  locale: DemoLocale = "en",
): string {
  const list = poolValuesFor(locale, pool);
  const i = Math.abs(Math.trunc(seed)) % list.length;
  return list[i]!;
}
