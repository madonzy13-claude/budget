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

/** The factor range the demo may use on any given night. */
export const SCALE_MIN = 0.1;
export const SCALE_MAX = 10;

/**
 * The night's money factor for one budget pair.
 *
 * Re-rolled every day so the demo's magnitudes carry no information about the
 * owner's real ones: watching the demo over time reveals a moving target, not
 * a fixed offset anyone could divide out.
 *
 * Sampled LOG-uniformly across [0.1, 10]. Plain uniform would put ~90% of its
 * mass above 1.0 — the demo would almost always inflate. Log-uniform gives
 * "shrink" and "grow" equal odds across the two orders of magnitude.
 *
 * Derived from (day, pair) rather than Math.random() so a re-run of the same
 * night reproduces the same demo, which keeps the job idempotent and the tests
 * deterministic.
 */
export function dailyMoneyScale(day: string, pairLabel: string): number {
  const h = hash32(`${day}:${pairLabel}`);
  const unit = h / 0x1_0000_0000; // [0,1)
  const logMin = Math.log(SCALE_MIN);
  const logMax = Math.log(SCALE_MAX);
  return Math.exp(logMin + unit * (logMax - logMin));
}

/** FNV-1a. Small, dependency-free, and good enough to decorrelate day/pair. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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

export type TextPool =
  "merchant" | "category" | "wallet" | "budget" | "holding";

const POOLS: Record<TextPool, string[]> = {
  merchant: [
    "City Market",
    "Corner Grocer",
    "Metro Transit",
    "Fuel Stop 24",
    "The Coffee Bar",
    "Riverside Pharmacy",
    "Bright Electric",
    "Municipal Water",
    "Streamly",
    "Fitness Club",
    "Hardware Depot",
    "Book Nook",
    "Green Garden Centre",
    "Family Diner",
    "Airline Booking",
    "Hotel Stay",
    "Insurance Premium",
    "Mobile Plan",
    "Home Internet",
    "Parking Garage",
  ],
  category: [
    "Groceries",
    "Transport",
    "Utilities",
    "Dining Out",
    "Health",
    "Household",
    "Subscriptions",
    "Travel",
    "Education",
    "Gifts",
    "Clothing",
    "Pets",
    "Home Repair",
    "Entertainment",
    "Savings",
  ],
  wallet: [
    "Main Account",
    "Joint Account",
    "Cash",
    "Credit Card",
    "Travel Card",
    "Savings Pot",
    "Reserve Pot",
    "Euro Account",
    "Brokerage",
    "Emergency Fund",
  ],
  budget: ["Personal", "Family"],
  holding: [
    "Global Equity Fund",
    "Tech Growth ETF",
    "Government Bond",
    "Gold Holding",
    "Digital Asset",
    "Dividend Fund",
    "Property Share",
  ],
};

/** Deterministic per (pool, seed) so a re-run of the same night is stable. */
export function fakeText(pool: TextPool, seed: number): string {
  const list = POOLS[pool];
  const i = Math.abs(Math.trunc(seed)) % list.length;
  return list[i]!;
}

/**
 * The pool's values, for the SQL side of the copy. The copy picks from these
 * in-database (indexing by a hash of the row id) rather than round-tripping
 * every row through TypeScript — but it MUST pick from this same list, so the
 * list has exactly one definition.
 */
export function poolValues(pool: TextPool): readonly string[] {
  return POOLS[pool];
}
